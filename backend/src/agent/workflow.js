const { StateGraph, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { runTestsInSandbox } = require('./docker');

// --- Helper Functions ---

const git = simpleGit();

/**
 * Clones the repository and creates the required branch.
 */
async function cloneAndSetup(state) {
    const { repoUrl, teamName, leaderName } = state;
    const repoName = repoUrl.split('/').pop().replace('.git', '');
    const localPath = path.resolve(__dirname, '../../temp', repoName + '-' + uuidv4());

    // Strict Branch Naming Rule: UPPERCASE(TEAM_NAME)_UPPERCASE(LEADER_NAME)_AI_Fix
    const branchName = `${teamName.toUpperCase().replace(/ /g, '_')}_${leaderName.toUpperCase().replace(/ /g, '_')}_AI_Fix`;

    try {
        console.log(`Cloning ${repoUrl} to ${localPath}...`);
        await git.clone(repoUrl, localPath);

        const repoGit = simpleGit(localPath);
        console.log(`Checking out branch ${branchName}...`);
        await repoGit.checkoutLocalBranch(branchName);

        return {
            localPath,
            branchName,
            status: 'CLONED',
            logs: [`Cloned ${repoUrl}`, `Created branch ${branchName}`]
        };
    } catch (error) {
        console.error("Clone failed:", error);
        return { status: 'FAILED', error: error.message };
    }
}

/**
 * Runs tests and updates state with failures.
 */
async function runTests(state) {
    const { localPath, iteration } = state;
    console.log(`Running tests (Iteration ${iteration})...`);

    // Auto-discover test command? For now, assume npm test or discover package.json
    // Ideally we inspect package.json scripts.
    let testCmd = 'npm test';
    if (fs.existsSync(path.join(localPath, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(localPath, 'package.json'), 'utf8'));
        if (pkg.scripts && pkg.scripts.test) {
            testCmd = 'npm test';
        } else {
            // Fallback logic could be added here
        }
    }

    const result = await runTestsInSandbox(localPath, testCmd);

    return {
        testOutput: result.output,
        passed: result.success,
        logs: [...state.logs, `Tests ${result.success ? 'PASSED' : 'FAILED'} (Iteration ${iteration})`]
    };
}

/**
 * Analyzes test output using LLM to identify bugs.
 */
async function analyzeFailure(state) {
    const { testOutput } = state;
    const model = new ChatOpenAI({
        modelName: "gpt-4-turbo", // Or configured model
        temperature: 0
    });

    // Prompt to strictly follow the output format
    const prompt = `
    Analyze the following test output and identify the failures.
    You must output a JSON object with a "bugs" array.
    Each bug object must have: "file", "type", "line", "description".
    
    Allowed Bug Types: LINTING, SYNTAX, LOGIC, TYPE_ERROR, IMPORT, INDENTATION.
    
    STRICT OUTPUT FORMAT for description:
    "LINTING error in src/utils.py line 15 Fix: remove the import statement"
    "SYNTAX error in src/validator.py line 8 Fix: add the colon at the correct position"
    
    Test Output:
    ${testOutput}
    `;

    const response = await model.invoke([new HumanMessage(prompt)]);

    // Parse JSON from LLM response (robust parsing needed)
    let bugs = [];
    try {
        const content = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
        bugs = JSON.parse(content).bugs || [];
    } catch (e) {
        console.error("Failed to parse LLM analysis", e);
    }

    return { bugs, logs: [...state.logs, `Identified ${bugs.length} bugs`] };
}

/**
 * Generates and applies fixes.
 */
async function applyFixes(state) {
    const { bugs, localPath } = state;
    const model = new ChatOpenAI({ modelName: "gpt-4-turbo", temperature: 0 });
    let fixesApplied = [];

    for (const bug of bugs) {
        const filePath = path.join(localPath, bug.file);
        if (!fs.existsSync(filePath)) continue;

        const fileContent = fs.readFileSync(filePath, 'utf8');

        const prompt = `
        Fix the following bug in the code.
        Bug: ${bug.description}
        File Content:
        ${fileContent}
        
        Return ONLY the full corrected file content. No markdown, no comments outside code.
        `;

        const response = await model.invoke([new HumanMessage(prompt)]);
        const fixedContent = response.content.replace(/```[\w]*\n/g, '').replace(/```/g, '').trim();

        fs.writeFileSync(filePath, fixedContent);

        // Commit the fix
        const repoGit = simpleGit(localPath);
        await repoGit.add(bug.file);
        await repoGit.commit(`[AI-AGENT] Fixed ${bug.type} in ${bug.file}`);

        fixesApplied.push({
            file: bug.file,
            type: bug.type,
            line: bug.line,
            commitMessage: `[AI-AGENT] Fixed ${bug.type} in ${bug.file}`,
            status: 'Fixed' // Optimistic, verification happens in next loop
        });
    }

    return {
        fixesApplied: [...state.fixesApplied, ...fixesApplied],
        iteration: state.iteration + 1,
        logs: [...state.logs, `Applied ${fixesApplied.length} fixes`]
    };
}

/**
 * Main Workflow Definition
 */
const workflow = new StateGraph({
    channels: {
        repoUrl: {
            value: (x, y) => y,
            default: () => ""
        },
        teamName: {
            value: (x, y) => y,
            default: () => ""
        },
        leaderName: {
            value: (x, y) => y,
            default: () => ""
        },
        localPath: {
            value: (x, y) => y,
            default: () => ""
        },
        branchName: {
            value: (x, y) => y,
            default: () => ""
        },
        iteration: {
            value: (x, y) => (y !== undefined ? y : x),
            default: () => 1
        },
        testOutput: {
            value: (x, y) => y,
            default: () => ""
        },
        passed: {
            value: (x, y) => y,
            default: () => false
        },
        bugs: {
            value: (x, y) => y,
            default: () => []
        },
        fixesApplied: {
            value: (x, y) => (x || []).concat(y || []),
            default: () => []
        },
        logs: {
            value: (x, y) => (x || []).concat(y || []),
            default: () => []
        },
        status: {
            value: (x, y) => y,
            default: () => "PENDING"
        },
        error: {
            value: (x, y) => y,
            default: () => null
        }
    }
});

// Add Nodes
workflow.addNode("setup", cloneAndSetup);
workflow.addNode("test", runTests);
workflow.addNode("analyze", analyzeFailure);
workflow.addNode("fix", applyFixes);

// Add Edges
workflow.setEntryPoint("setup");

workflow.addEdge("setup", "test");

workflow.addConditionalEdges(
    "test",
    (state) => {
        if (state.passed) return "end";
        if (state.iteration > 5) return "end"; // Max retries
        return "analyze";
    },
    {
        end: END,
        analyze: "analyze"
    }
);

workflow.addEdge("analyze", "fix");
workflow.addEdge("fix", "test");

const app = workflow.compile();

async function runAgent(inputs) {
    const config = { recursionLimit: 50 };
    // Invoke the graph
    const result = await app.invoke({
        repoUrl: inputs.repoUrl,
        teamName: inputs.teamName,
        leaderName: inputs.leaderName,
        iteration: 1,
        fixesApplied: [],
        logs: []
    }, config);

    // Generate results.json
    const output = {
        repoUrl: result.repoUrl,
        teamName: result.teamName,
        leaderName: result.leaderName,
        branchName: result.branchName,
        totalFailures: result.bugs ? result.bugs.length : 0,
        totalFixes: result.fixesApplied ? result.fixesApplied.length : 0,
        status: result.passed ? 'PASSED' : 'FAILED',
        logs: result.logs,
        fixes: result.fixesApplied
    };

    try {
        const resultsPath = path.resolve(__dirname, '../../results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
        console.log(`Results saved to ${resultsPath}`);
    } catch (e) {
        console.error("Failed to save results.json", e);
    }

    return output;
}

module.exports = { runAgent };
