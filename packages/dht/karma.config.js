/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const { createKarmaConfig, createWebpackConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    'test/unit/**/*.ts',
    'test/integration/**/*.ts',
    'test/end-to-end/**/*.ts'
]

const NodeWebRtcConnection = path.resolve(__dirname, 'src/connection/WebRTC/NodeWebRtcConnection.ts')
const BrowserWebRtcConnection = path.resolve(__dirname, 'src/connection/WebRTC/BrowserWebRtcConnection.ts')

module.exports = createKarmaConfig(TEST_PATHS, createWebpackConfig({
    entry: './src/exports.ts',
    libraryName: 'dht',
    alias: {
        [NodeWebRtcConnection]: BrowserWebRtcConnection
    }
}))
