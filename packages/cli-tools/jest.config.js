const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    globalTeardown: './jest.teardown.js'
}
