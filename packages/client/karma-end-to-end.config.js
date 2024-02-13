/* eslint-disable @typescript-eslint/no-require-imports */
const webpackConfig = require('./webpack.config')
const { createKarmaConfig } = require('@streamr/browser-test-runner')

module.exports = createKarmaConfig(['test/end-to-end/**/*.ts'], webpackConfig, __dirname)
