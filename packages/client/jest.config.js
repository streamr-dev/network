const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalSetup: './jest.setup.js',
    globalTeardown: './jest.teardown.js',
    setupFilesAfterEnv: rootConfig.setupFilesAfterEnv.concat('./test/test-utils/customMatchers.ts'),
    modulePathIgnorePatterns: [
        '<rootDir>/dist/package.json',
    ]
}
