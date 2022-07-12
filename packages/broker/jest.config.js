const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalTeardown: './jest.teardown.js',
    testTimeout: 10000
}
