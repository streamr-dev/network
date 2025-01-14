const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalSetup: './jest.setup.js',
    setupFilesAfterEnv: rootConfig.setupFilesAfterEnv.concat([
        './test/test-utils/customMatchers.ts',
        '@streamr/test-utils/setupCustomMatchers'
    ]),
    modulePathIgnorePatterns: ['<rootDir>/dist/package.json']
}
