const { runAuditor } = require('./auditor');
const { runSolver } = require('./solver');
const engineNode = require('../engines/node');
const enginePython = require('../engines/python');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');

/**
 * Agent Two: The Orchestrator
 *
 * Flow:
 *  1. Clone repo, create fix branch, detect engine.
 *  2. Iteration 1: Run all tests. Pass → done. Fail → discover ALL issues.
 *  3. Solver fixes OPEN issues, marks each FIXED in issues_log.json.
 *  4. Re-run. Pass → commit issue-by-issue, push branch, status PASSED + endTime.
 *     Fail → re-scan, skip FIXED issues, fix remaining.
 *  5. At end (success OR failure after fixes), always push branch + set endTime.
 */
async function startOrchestrator(repoUrl, teamName, leaderName) {
    console.log('[Orchestrator] Initializing...');

    const resultsPath = path.resolve(__dirname, '../../../results.json');

    const updateFrontend = (data, reset = false) => {
        try {
            const base = (!reset && fs.existsSync(resultsPath))
                ? JSON.parse(fs.readFileSync(resultsPath))
                : {};
            fs.writeFileSync(resultsPath, JSON.stringify({ ...base, ...data }, null, 2));
        } catch (e) {
            console.error('[Orchestrator] Update frontend failed:', e);
        }
    };

    const startTime = Date.now();
    updateFrontend({
        repoUrl, teamName, leaderName,
        status: 'RUNNING', logs: ['Initializing Agent System...'],
        fixes: [], iterations: 0, startTime, endTime: null, filesScanned: 0, branchName: 'N/A'
    }, true);

    // --- Phase 1: Auditor ---
    const auditorResult = await runAuditor(repoUrl, teamName, leaderName);
    if (!auditorResult.success) {
        updateFrontend({ status: 'FAILED', endTime: Date.now(), logs: [`✗ Auditor failed: ${auditorResult.error}`] });
        return;
    }

    const { localPath, branchName } = auditorResult;
    const repoGit = simpleGit(localPath);
    const issuesLogPath = path.join(localPath, 'issues_log.json');

    updateFrontend({ branchName, logs: [`✓ Cloned repo`, `✓ Branch: ${branchName}`] });

    // --- Phase 2: Engine Detection ---
    const engines = [
        require('../engines/node'),
        require('../engines/python'),
        require('../engines/java'),
        require('../engines/go'),
        require('../engines/ruby')
    ];

    const activeEngines = [];
    for (const eng of engines) {
        if (eng.discover(localPath)) {
            activeEngines.push(eng);
        }
    }

    if (activeEngines.length === 0) {
        updateFrontend({ status: 'FAILED', endTime: Date.now(), logs: ['✗ No supported language detected'] });
        return;
    }

    const detectedNames = activeEngines.map(e => e.constructor.name.replace('Engine', '') || 'Unknown').join(', ');
    updateFrontend({ logs: [`✓ Detected engines: ${detectedNames}`], detectedEngines: detectedNames });

    // --- Issues log helpers ---
    const readLog = () => {
        try { return JSON.parse(fs.readFileSync(issuesLogPath, 'utf8')); }
        catch { return { issues: [] }; }
    };
    const writeLog = (log) => fs.writeFileSync(issuesLogPath, JSON.stringify(log, null, 2));

    // Helper: collect fixed files for commit
    const commitFixes = async (fixes, outputLog) => {
        const committed = [];
        for (const fix of fixes) {
            try {
                await repoGit.add(fix.file);
                const msg = `[AI-AGENT] Fix ${fix.type} in ${fix.file}: ${fix.description.substring(0, 60)}`;
                await repoGit.commit(msg);
                committed.push({ ...fix, commitMessage: msg, status: 'Fixed' });
                outputLog.push(`  ✓ Committed: ${fix.file} [${fix.type}]`);
            } catch (e) {
                if (!e.message.includes('nothing to commit')) {
                    outputLog.push(`  ⚠ Commit skipped for ${fix.file}: ${e.message}`);
                }
            }
        }
        return committed;
    };

    // --- Phase 3: Healing Loop ---
    const outputLog = [];
    const allFixes = [];     // All fixes applied across iterations
    let isSuccess = false;
    const MAX_ITER = 6;
    let lastTestOutput = '';

    for (let i = 1; i <= MAX_ITER; i++) {
        console.log(`[Orchestrator] Iteration ${i}/${MAX_ITER}...`);
        outputLog.push(`━━━ Iteration ${i} / ${MAX_ITER} ━━━`);
        outputLog.push(`Running test suite(s)...`);
        updateFrontend({ iterations: i, logs: [...outputLog] });

        // A. Run tests (Polyglot)
        let combinedOutput = '';
        let allEnginesPassed = true;

        for (const eng of activeEngines) {
            try {
                // Some engines might need subDir, but for now we pass localPath. 
                // Engines needing subDir should handle discovery internally or we assume root.
                // NOTE: discover() usually returns the subDir, so we might need to map that.
                // For simplicity in this refactor, we assume engines handle 'localPath' correctly or we pass '.'
                const subDir = eng.discover(localPath);

                const result = await eng.run(localPath, subDir || '.');
                combinedOutput += `\n--- START ${eng.constructor.name} OUTPUT ---\n`;
                combinedOutput += result.output;
                combinedOutput += `\n--- END ${eng.constructor.name} OUTPUT ---\n`;

                if (!result.success) allEnginesPassed = false;
            } catch (e) {
                console.error(`[Orchestrator] Engine execution failed:`, e);
                combinedOutput += `\nEngine execution failed: ${e.message}\n`;
                allEnginesPassed = false;
            }
        }

        lastTestOutput = combinedOutput;
        outputLog.push(`Run result: ${allEnginesPassed ? '✓ PASS' : '✗ FAIL'}`);

        // B. All tests pass → commit + push + done
        if (allEnginesPassed) {
            isSuccess = true;
            outputLog.push(`🎉 All tests PASSED on iteration ${i}!`);
            updateFrontend({ logs: [...outputLog] });
            break;
        }

        // C. Build set of already-addressed issues
        const currentLog = readLog();
        const addressedKeys = new Set(
            currentLog.issues
                .filter(iss => iss.status !== 'OPEN')
                .map(iss => `${iss.file}::${iss.type}::${iss.line}`)
        );

        // D. Discover issues from LLM — pass full test output + source files list
        const scanLabel = i === 1 ? 'comprehensive scan' : 're-scan';
        outputLog.push(`Analyzing failures (${scanLabel})...`);
        updateFrontend({ logs: [...outputLog] });

        const discovered = await analyzeOutput(combinedOutput, localPath);

        // Filter out already-addressed issues BUT check for persistence
        const newIssues = [];
        const reOpenedIssues = [];

        for (const disc of discovered) {
            const keys = [`${disc.file}::${disc.type}::${disc.line}`, `${disc.file}::${disc.type}::0`]; // fuzzy match line 0

            // Check if this issue was supposedly FIXED
            const existingFixed = currentLog.issues.find(iss =>
                (keys.includes(`${iss.file}::${iss.type}::${iss.line}`)) && iss.status === 'FIXED'
            );

            if (existingFixed) {
                // IT CAME BACK! Re-open it and flag as recurring for the Solver.
                console.log(`[Orchestrator] Issue reappeared: ${disc.file}::${disc.type}`);
                existingFixed.status = 'OPEN';
                existingFixed.isRecurring = true;
                existingFixed.description += " [NOTE: Previous fix failed. Check for dependency issues or incorrect import paths.]";
                reOpenedIssues.push(existingFixed);
            } else if (!addressedKeys.has(`${disc.file}::${disc.type}::${disc.line}`)) {
                // Truly new issue
                newIssues.push(disc);
            }
        }

        console.log(`[Orchestrator] Iter ${i}: ${discovered.length} found. New: ${newIssues.length}, Re-opened: ${reOpenedIssues.length}`);

        if (newIssues.length === 0 && reOpenedIssues.length === 0) {
            // Zero-issue failure: could be environment or dependency issue — try a clean reinstall
            outputLog.push(`⚠ Tests failed but no code bugs detected. Attempting clean environment recovery...`);
            updateFrontend({ logs: [...outputLog] });

            // Trigger clean reinstall in sandbox for each active engine (best effort)
            try {
                const { runTestsInSandbox } = require('../agents/docker');
                const isNode = fs.existsSync(path.join(localPath, 'package.json'));
                const isPython = fs.existsSync(path.join(localPath, 'requirements.txt'));
                if (isNode) {
                    await runTestsInSandbox(localPath, 'rm -rf node_modules && npm install', 'node:18-alpine');
                    outputLog.push(`✓ Node.js clean reinstall completed.`);
                }
                if (isPython) {
                    await runTestsInSandbox(localPath, 'pip install --force-reinstall -r requirements.txt', 'python:3.9-alpine');
                    outputLog.push(`✓ Python clean reinstall completed.`);
                }
            } catch (reinstallErr) {
                outputLog.push(`⚠ Recovery attempt failed: ${reinstallErr.message}`);
            }

            outputLog.push(`Tests failed due to environment or system error. Agent attempted automatic recovery.`);
            updateFrontend({ logs: [...outputLog] });
            break;
        }

        if (reOpenedIssues.length > 0) {
            outputLog.push(`⚠ ${reOpenedIssues.length} issue(s) reappeared after fix. Re-opening...`);
        }

        if (newIssues.length > 0) {
            outputLog.push(`Found ${newIssues.length} new issue(s).`);
        }

        outputLog.push(`Found ${newIssues.length} issue(s) to fix:`);
        newIssues.forEach((iss, idx) => {
            outputLog.push(`  ${idx + 1}. [${iss.type}] ${iss.file}:${iss.line || '?'} — ${iss.description}`);
        });

        // E. Merge into log + push to frontend immediately
        const existingKeys = new Set(currentLog.issues.map(iss => `${iss.file}::${iss.type}::${iss.line}`));
        for (const iss of newIssues) {
            if (!existingKeys.has(`${iss.file}::${iss.type}::${iss.line}`)) {
                currentLog.issues.push({ ...iss, status: 'OPEN', discoveredAt: i });
            }
        }
        writeLog(currentLog);

        // Push all issues (any status) to the frontend immediately so they appear in the table
        const allIssuesForFrontend = currentLog.issues.map(iss => ({
            file: iss.file,
            type: iss.type,
            line: iss.line || 0,
            description: iss.description,
            status: iss.status,           // OPEN, FIXED, FAILED_*
            commitMessage: iss.commitMessage || null
        }));
        updateFrontend({ fixes: allIssuesForFrontend, logs: [...outputLog] });

        if (i === MAX_ITER) {
            outputLog.push(`Max iterations (${MAX_ITER}) reached.`);
            break;
        }

        // F. Fix OPEN issues
        outputLog.push(`Applying fixes to source files...`);
        updateFrontend({ logs: [...outputLog] });

        const openIssues = currentLog.issues.filter(iss => iss.status === 'OPEN');
        const solveResult = await runSolver(localPath, openIssues, issuesLogPath, lastTestOutput);

        allFixes.push(...solveResult.fixesApplied);
        solveResult.fixesApplied.forEach(fix => {
            outputLog.push(`  ✓ Fixed [${fix.type}] in ${fix.file}`);
        });

        // Re-read log (solver updated statuses) and push live to frontend
        const updatedLog = readLog();
        const updatedFixes = updatedLog.issues.map(iss => ({
            file: iss.file,
            type: iss.type,
            line: iss.line || 0,
            description: iss.description,
            status: iss.status,
            commitMessage: iss.commitMessage || null
        }));
        updateFrontend({ fixes: updatedFixes, logs: [...outputLog] });
    }

    // --- Phase 4: Final Sanity Run (if fixes were applied but not yet confirmed passing) ---
    if (allFixes.length > 0 && !isSuccess) {
        outputLog.push(`━━━ Final Sanity Run ━━━`);
        outputLog.push(`Running all engines one last time to verify all fixes...`);
        updateFrontend({ logs: [...outputLog] });

        let sanityPassed = true;
        let sanityCombinedOutput = '';
        for (const eng of activeEngines) {
            try {
                const subDir = eng.discover(localPath);
                const result = await eng.run(localPath, subDir || '.');
                sanityCombinedOutput += `\n--- SANITY ${eng.constructor.name} ---\n${result.output}\n`;
                if (!result.success) sanityPassed = false;
            } catch (e) {
                sanityCombinedOutput += `\nEngine error: ${e.message}\n`;
                sanityPassed = false;
            }
        }

        if (sanityPassed) {
            isSuccess = true;
            outputLog.push(`🎉 Final Sanity Run PASSED! All fixes verified.`);
        } else {
            outputLog.push(`✗ Final Sanity Run failed — some issues persist.`);
        }
        updateFrontend({ logs: [...outputLog] });
    }

    // --- Phase 5: Commit + Push (always if fixes were applied) ---
    if (allFixes.length > 0 || isSuccess) {
        outputLog.push(`Committing ${allFixes.length} fix(es) to branch...`);
        updateFrontend({ logs: [...outputLog] });

        // Commit all fixes that were applied (using issues_log as source of truth)
        const logForCommit = readLog();
        const fixedIssues = logForCommit.issues.filter(iss => iss.status === 'FIXED');
        const committed = await commitFixes(fixedIssues, outputLog);

        // Push branch to remote only if we have actual committed fixes
        if (committed.length > 0) {
            try {
                outputLog.push(`Pushing branch "${branchName}"...`);
                updateFrontend({ logs: [...outputLog] });
                await repoGit.push('origin', branchName, { '--force': null, '--set-upstream': null });
                outputLog.push(`✓ Branch pushed successfully!`);
            } catch (e) {
                outputLog.push(`⚠ Push failed: ${e.message}`);
            }
        }

        const finalStatus = isSuccess ? 'PASSED' : 'FAILED';
        const finalFixes = committed.length > 0 ? committed : allFixes;
        updateFrontend({ status: finalStatus, endTime: Date.now(), fixes: finalFixes, logs: [...outputLog] });
    } else {
        updateFrontend({ status: 'FAILED', endTime: Date.now(), logs: [...outputLog] });
    }

    console.log(`[Orchestrator] Done. Success: ${isSuccess}`);
}

/**
 * LLM: Analyze test output and map failures to SOURCE files (not test files).
 * Provides list of source files in the repo for better context.
 */
async function analyzeOutput(output, localPath) {
    const model = new ChatOpenAI({ modelName: 'gpt-4-turbo', temperature: 0 });

    // Enumerate source files to help LLM target the right ones
    let srcFiles = '';
    try {
        const srcPath = path.join(localPath, 'src');
        if (fs.existsSync(srcPath)) {
            const files = fs.readdirSync(srcPath).map(f => `src/${f}`);
            srcFiles = `Source files in this repo:\n${files.join('\n')}`;
        }
    } catch (e) { /* ignore */ }

    const prompt = `
You are a CI/CD diagnostic agent. Analyze the failing test output and identify issues in the SOURCE CODE.

CRITICAL RULES:
1. Tests fail because SOURCE CODE has bugs — fix the SOURCE FILES (e.g. src/calculator.js), NOT the test files.
2. Only fix test files if the test itself has an obvious error (e.g. wrong assertion with no corresponding source issue).
3. "file" MUST be a RELATIVE path from repo root (e.g. "src/calculator.js"). NEVER "/app/..." absolute paths.
4. "type": LINTING | SYNTAX | LOGIC | TYPE_ERROR | IMPORT | INDENTATION | RUNTIME
5. "line": the line number in the SOURCE FILE where the bug is. 0 if unknown.
6. Include EVERY distinct error from user source code.
7. Ignore node_modules, npm install logs, system paths.

${srcFiles}

Return ONLY this JSON:
{ "issues": [ { "description": "...", "file": "src/...", "type": "...", "line": 0, "status": "OPEN" } ] }

Test/Build Output:
${output.substring(0, 12000)}
`;

    try {
        const response = await model.invoke([new HumanMessage(prompt)]);
        const content = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(content).issues || [];
    } catch (e) {
        console.error('[Orchestrator] LLM Parse Error:', e.message);
        return [];
    }
}

module.exports = { startOrchestrator };
