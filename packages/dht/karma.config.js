const path = require('path')
const buildConfig = require('@streamr/browser-test-runner')

const NodeWebRtcConnection = path.resolve(__dirname, 'src/connection/WebRTC/NodeWebRtcConnection.ts')
const BrowserWebRtcConnection = path.resolve(__dirname, 'src/connection/WebRTC/BrowserWebRtcConnection.ts')

module.exports = buildConfig(
    './src/exports.ts',
    'dht',
    ['test/unit/**/*.ts', 'test/integration/**/*.ts', 'test/end-to-end/**/*.ts'],
    {
        [NodeWebRtcConnection]: BrowserWebRtcConnection
    })
