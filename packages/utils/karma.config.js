const buildConfig = require('@streamr/browser-test-runner')
module.exports = buildConfig('./src/exports.ts', 'utils', ['test/**/*.ts'])
