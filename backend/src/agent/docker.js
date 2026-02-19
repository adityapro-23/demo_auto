const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const docker = new Docker(); // Defaults to socket/pipe

/**
 * Runs the tests in a sandboxed Docker container.
 * @param {string} repoPath - Local path to the cloned repository
 * @param {string} testCommand - Command to run tests (e.g., 'npm test')
 * @param {string} imageName - Docker image to use (default: 'node:18-alpine')
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function runTestsInSandbox(repoPath, testCommand = 'npm test', imageName = 'node:18-alpine') {
    const containerId = uuidv4();
    // const imageName = 'node:18-alpine'; // Moved to parameter

    try {
        // Ensure image exists (Properly wait for download)
        try {
            console.log(`Pulling image ${imageName}...`);
            await new Promise((resolve, reject) => {
                docker.pull(imageName, (err, stream) => {
                    if (err) return reject(err);
                    docker.modem.followProgress(stream, onFinished, onProgress);
                    function onFinished(err, output) {
                        if (err) return reject(err);
                        resolve(output);
                    }
                    // eslint-disable-next-line no-unused-vars
                    function onProgress(event) {
                        // Optional: log progress
                    }
                });
            });
            console.log(`Successfully pulled ${imageName}`);
        } catch (pullError) {
            console.error(`Failed to pull image ${imageName}:`, pullError);
            throw pullError; // Re-throw to stop execution if image is missing
        }

        // Resolve Host Path for Bind Mount
        // The container determines 'repoPath' as '/app/temp/...'.
        // But the Host Docker Daemon needs the absolute path on the HOST machine (e.g., 'D:\demo_dock\temp\...').
        let hostRepoPath = path.resolve(repoPath);
        console.log(`[Docker Debug] Internal Repo Path: ${hostRepoPath}`);
        console.log(`[Docker Debug] HOST_WORKDIR: ${process.env.HOST_WORKDIR}`);

        if (process.env.HOST_WORKDIR) {
            // Replace internal '/app' with host's workspace path
            hostRepoPath = hostRepoPath.replace('/app', process.env.HOST_WORKDIR);
        }
        console.log(`[Docker Debug] Final Bind Path: ${hostRepoPath}`);

        const container = await docker.createContainer({
            Image: imageName,
            Cmd: ['sh', '-c', `cd /app && ${testCommand}`],
            HostConfig: {
                Binds: [`${hostRepoPath}:/app`], // Use HOST path for binding
                AutoRemove: true, // Clean up after run
            },
            Tty: true, // Enable TTY to simplify log output (merges stdout/stderr)
            AttachStdout: true,
            AttachStderr: true
        });

        await container.start();

        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true
        });

        const outputPromise = new Promise((resolve, reject) => {
            let output = '';
            stream.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                // console.log('Docker Chunk:', chunkStr); // Debug logging
                output += chunkStr;
            });
            stream.on('end', () => {
                resolve(output);
            });
            stream.on('error', (err) => {
                reject(err);
            });
        });

        const data = await container.wait();
        const output = await outputPromise;

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
