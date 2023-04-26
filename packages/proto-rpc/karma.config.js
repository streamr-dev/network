const buildConfig = require('@streamr/browser-test-runner')
module.exports = buildConfig('./src/exports.ts', 'proto-rpc', ['test/**/*.ts'])
