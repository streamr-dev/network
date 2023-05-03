/* eslint-disable @typescript-eslint/no-require-imports */
const webpackConfig = require('./webpack.config')
const { createKarmaConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    'test/end-to-end/**/*.ts'
]

module.exports = createKarmaConfig(TEST_PATHS, webpackConfig)
