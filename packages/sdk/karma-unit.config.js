/* eslint-disable @typescript-eslint/no-require-imports */
const webpackConfig = require('./webpack-karma.config')
const { createKarmaConfig } = require('@streamr/browser-test-runner')

module.exports = createKarmaConfig(['test/unit/**/*.ts'], webpackConfig, __dirname)
