/* eslint-disable @typescript-eslint/no-require-imports */
const karmaConfig = require('./karma.config')
const webpackConfig = require('./webpack.config.js')

module.exports = function(entryPoint, libraryName, testPath) {
    return karmaConfig(webpackConfig(entryPoint, libraryName), testPath)
}
