const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalSetup: './jest.setup.js',
    globalTeardown: './jest.teardown.js'
}
