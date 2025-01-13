const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    setupFilesAfterEnv: rootConfig.setupFilesAfterEnv.concat('@streamr/test-utils/setupCustomMatchers'),
    testTimeout: 15000
}
