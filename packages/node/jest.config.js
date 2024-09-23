const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalTeardown: './jest.teardown.js',
    setupFilesAfterEnv: rootConfig.setupFilesAfterEnv.concat(
        '@streamr/test-utils/setupCustomMatchers'
    ),
    testTimeout: 10000
}
