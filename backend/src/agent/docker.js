const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const docker = new Docker(); // Defaults to socket/pipe

/**
 * Runs the tests in a sandboxed Docker container.
 * @param {string} repoPath - Local path to the cloned repository
 * @param {string} testCommand - Command to run tests (e.g., 'npm test')
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function runTestsInSandbox(repoPath, testCommand = 'npm test') {
    const containerId = uuidv4();
    const imageName = 'node:18-alpine'; // Lightweight node image

    try {
        // Ensure image exists
        try {
            console.log(`Pulling image ${imageName}...`);
            await docker.pull(imageName);
        } catch (pullError) {
            console.error(`Failed to pull image ${imageName}:`, pullError);
            // Verify if we have it locally anyway, or let createContainer fail if strictly needed
        }

        const container = await docker.createContainer({
            Image: imageName,
            Cmd: ['sh', '-c', `cd /app && ${testCommand}`],
            HostConfig: {
                Binds: [`${path.resolve(repoPath)}:/app`], // Mount repo to /app
                AutoRemove: true, // Clean up after run
            },
            Tty: false,
            AttachStdout: true,
            AttachStderr: true
        });

        await container.start();

        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true
        });

        let output = '';
        stream.on('data', (chunk) => {
            output += chunk.toString();
        });

        const data = await container.wait();

        return {
            success: data.StatusCode === 0,
            output: output
        };

    } catch (error) {
        console.error('Docker execution failed:', error);
        return {
            success: false,
            output: `Docker execution error: ${error.message}`
        };
    }
}

module.exports = { runTestsInSandbox };
