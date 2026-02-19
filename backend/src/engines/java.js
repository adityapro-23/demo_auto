const { runTestsInSandbox } = require('../agents/docker');
const path = require('path');
const fs = require('fs');

/**
 * Java Engine
 * Support: Maven (pom.xml) and Gradle (build.gradle)
 */
const engineJava = {
    discover: (localPath) => {
        if (fs.existsSync(path.join(localPath, 'pom.xml'))) return 'maven';
        if (fs.existsSync(path.join(localPath, 'build.gradle'))) return 'gradle';
        return null;
    },

    run: async (localPath, type) => {
        console.log(`[JavaEngine] Running ${type} project...`);

        // Use a JDK 11 image as a safe default for legacy/modern checks
        const imageName = 'maven:3.8-openjdk-11';

        // Command selection
        let testCmd = '';
        if (type === 'maven') {
            testCmd = 'mvn test -B'; // -B = batch mode (no colors/progress bars)
        } else {
            testCmd = 'chmod +x gradlew && ./gradlew test --no-daemon';
        }

        return await runTestsInSandbox(localPath, testCmd, imageName);
    }
};

module.exports = engineJava;
