const fs = require('fs');
const path = require('path');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');

/**
 * Agent Three: The Solver
 * Fixes OPEN issues using full file content + test failure context.
 * Supports recurring issue detection, dependency file patching, and multi-file output.
 */
async function runSolver(localPath, openIssues, issuesLogPath, testOutput = '') {
    console.log('[Solver] Starting repairs...');
    const model = new ChatOpenAI({ modelName: 'gpt-4-turbo', temperature: 0 });
    const fixesApplied = [];

    if (!openIssues || openIssues.length === 0) return { fixesApplied };

    const updateIssueStatus = (file, type, line, newStatus) => {
        try {
            const log = JSON.parse(fs.readFileSync(issuesLogPath, 'utf8'));
            const issue = log.issues.find(i => i.file === file && i.type === type && i.line === line);
            if (issue) {
                issue.status = newStatus;
                issue.fixedAt = new Date().toISOString();
                fs.writeFileSync(issuesLogPath, JSON.stringify(log, null, 2));
                console.log(`[Solver] Marked ${file}::${type}::${line} as ${newStatus} in issues_log.json`);
            }
        } catch (e) {
            console.error('[Solver] Failed to update issues_log.json:', e.message);
        }
    };

    // Relevant test output snippet for context
    const testSnippet = testOutput ? testOutput.substring(0, 3000) : '';

    for (const issue of openIssues) {
        try {
            console.log(`[Solver] Fixing ${issue.type} in ${issue.file}...`);
            const filePath = path.join(localPath, issue.file);

            if (!fs.existsSync(filePath)) {
                console.error(`[Solver] File not found: ${filePath}`);
                updateIssueStatus(issue.file, issue.type, issue.line, 'FAILED_FILE_NOT_FOUND');
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf8');

            // Read dependency files for context if applicable
            let depContext = '';
            const pkgPath = path.join(localPath, 'package.json');
            const reqPath = path.join(localPath, 'requirements.txt');
            if (fs.existsSync(pkgPath)) depContext += `\npackage.json:\n${fs.readFileSync(pkgPath, 'utf8').substring(0, 2000)}`;
            if (fs.existsSync(reqPath)) depContext += `\nrequirements.txt:\n${fs.readFileSync(reqPath, 'utf8').substring(0, 1000)}`;

            const recurringNote = issue.isRecurring
                ? `\n⚠ RECURRING BUG: A previous fix attempt did not resolve this. PLEASE:\n  1. Check if the issue is a missing dependency in package.json or requirements.txt.\n  2. Verify that the import path is correct relative to the repo root.\n  3. If a dependency is missing, respond with JSON: { "fixedFile": "...", "fixedContent": "...", "depFile": "package.json OR requirements.txt", "depContent": "...full corrected dep file..." }\n  Otherwise, respond with just the corrected file content as plain text.`
                : '';

            const prompt = `
You are an expert software engineer. Fix the specific bug in the source file described below.

Bug Details:
- File: ${issue.file}
- Type: ${issue.type}
- Line: ${issue.line || 'unknown'}
- Description: ${issue.description}
${recurringNote}

Failing Test Output (for context only — do NOT edit test files):
\`\`\`
${testSnippet}
\`\`\`

Current content of "${issue.file}":
\`\`\`
${fileContent}
\`\`\`
${depContext ? `\nDependency Files (modify ONLY if a dependency is truly missing):\n${depContext}` : ''}

Instructions:
1. Fix ONLY the specific bug described above. Do NOT change any other logic.
2. Do NOT modify test files unless the error is clearly an import path issue in the test itself.
3. If this is a ModuleNotFoundError or Import Error:
    - You MAY create/add a missing __init__.py file if needed (return its content).
    - You MAY correct relative imports.
4. If this is a RECURRING issue and the root cause is a missing package, respond with JSON (see above).
5. Otherwise: return the COMPLETE corrected content of "${issue.file}" — nothing else.
6. No explanation, no markdown fences unless responding with JSON, just the raw corrected code.
`;

            const response = await model.invoke([new HumanMessage(prompt)]);
            let fixedContent = response.content;

            // Check if LLM responded with a multi-file JSON (for recurring dep issues)
            let parsedMulti = null;
            try {
                const stripped = fixedContent.replace(/^```json\n?/gm, '').replace(/```$/gm, '').trim();
                const maybeJson = JSON.parse(stripped);
                if (maybeJson.fixedFile && maybeJson.fixedContent) parsedMulti = maybeJson;
            } catch (_) { /* not JSON, treat as plain code */ }

            if (parsedMulti) {
                // Write fixed source file
                const targetPath = path.join(localPath, parsedMulti.fixedFile);
                fs.writeFileSync(targetPath, parsedMulti.fixedContent);
                console.log(`[Solver] Wrote fixed ${parsedMulti.fixedFile}`);

                // Write dependency file if provided
                if (parsedMulti.depFile && parsedMulti.depContent) {
                    const depFilePath = path.join(localPath, parsedMulti.depFile);
                    fs.writeFileSync(depFilePath, parsedMulti.depContent);
                    console.log(`[Solver] Updated dep file: ${parsedMulti.depFile}`);
                }
            } else {
                // Strip markdown fences if present
                if (fixedContent.includes('```')) {
                    fixedContent = fixedContent
                        .replace(/^```[\w]*\n?/gm, '')
                        .replace(/```$/gm, '')
                        .trim();
                }
                fs.writeFileSync(filePath, fixedContent);
            }

            // Mark fixed in issues_log immediately
            updateIssueStatus(issue.file, issue.type, issue.line, 'FIXED');

            fixesApplied.push({
                file: issue.file,
                type: issue.type,
                description: issue.description,
                line: issue.line,
                status: 'APPLIED'
            });

        } catch (error) {
            console.error(`[Solver] Failed to fix ${issue.file}:`, error.message);
            updateIssueStatus(issue.file, issue.type, issue.line, 'FAILED_GENERATION');
        }
    }

    return { fixesApplied };
}

module.exports = { runSolver };
