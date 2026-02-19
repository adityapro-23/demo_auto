const { runTestsInSandbox } = require('../agents/docker');
const path = require('path');
const fs = require('fs');

/**
 * Ruby Engine
 * Support: Bundler (Gemfile)
 */
const engineRuby = {
    discover: (localPath) => {
        if (fs.existsSync(path.join(localPath, 'Gemfile'))) return '.';
        return null;
    },

    run: async (localPath, subDir = '.') => {
        console.log(`[RubyEngine] Running Ruby tests...`);

        const imageName = 'ruby:3.2-alpine';

        // 1. Install bundler dependencies
        // 2. Run tests (try standard rake test, then rspec if rake fails or just blind run)
        // Ideally we check for Rakefile, but `bundle exec rake test` is the standard convention.
        // We add `apk add build-base` because Ruby gems often need native extensions compile.
        const testCmd = `apk add --no-cache build-base && \
                         bundle install && \
                         bundle exec rake test`;

        return await runTestsInSandbox(localPath, testCmd, imageName);
    }
};

module.exports = engineRuby;
