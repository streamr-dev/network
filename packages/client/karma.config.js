/* eslint-disable @typescript-eslint/no-require-imports */
const webpackConfig = require('./webpack.config')
const { createKarmaConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    'test/unit/**/*.ts',
    'test/integration/**/*.ts'
]

module.exports = createKarmaConfig(TEST_PATHS, webpackConfig)
