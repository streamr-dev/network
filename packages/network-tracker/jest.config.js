const rootConfig = require('../../jest.config')
module.exports = {
    ...rootConfig,
    testTimeout: 15000,
    testPathIgnorePatterns: [
        '/browser/',
        '/node_modules/'
    ]
}
