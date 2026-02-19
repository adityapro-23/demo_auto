const { runTestsInSandbox } = require('../agents/docker');
const path = require('path');
const fs = require('fs');

/**
 * Go Engine
 * Support: Go Modules (go.mod)
 */
const engineGo = {
    discover: (localPath) => {
        if (fs.existsSync(path.join(localPath, 'go.mod'))) return '.';
        return null;
    },

    run: async (localPath, subDir = '.') => {
        console.log(`[GoEngine] Running Go tests...`);

        // Standard Go container
        const imageName = 'golang:1.21-alpine';

        // Install build tools if needed + run tests recursively
        // -v for verbose output so the LLM has more to work with
        const testCmd = `go test -v ./...`;

        return await runTestsInSandbox(localPath, testCmd, imageName);
    }
};

module.exports = engineGo;
