const rootConfig = require('../../jest.config')

module.exports = {
    ...rootConfig,
    setupFilesAfterEnv: rootConfig.setupFilesAfterEnv.concat('./src/customMatchers.ts')
}
