/* eslint-disable @typescript-eslint/no-require-imports */
const karmaConfig = require('./karma.config')
const webpackConfig = require('./webpack.config.js')

module.exports = function(entryPoint, libraryName, testPaths, customAliases) {
    return karmaConfig(webpackConfig(entryPoint, libraryName, customAliases), testPaths)
}
