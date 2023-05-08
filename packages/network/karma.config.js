/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const { createKarmaConfig, createWebpackConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    './test/browser/BrowserWebRtcConnection.test.ts',
    './test/browser/IntegrationBrowserWebRtcConnection.test.ts',
    './test/integration/**/!(NodeWebRtcConnection*|tracker*|nodeMessageBuffering*|UnixSocketWsServer*|message-duplication*).ts/',
    './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*|Speedometer*|deprecated-tracker-status*).ts'
]

const NodeWebRtcConnection = path.resolve(__dirname, 'src/connection/webrtc/NodeWebRtcConnection.ts')
const BrowserWebRtcConnection = path.resolve(__dirname, 'src/connection/webrtc/BrowserWebRtcConnection.ts')

const NodeClientWsEndpoint = path.resolve(__dirname, 'src/connection/ws/NodeClientWsEndpoint.ts')
const BrowserClientWsEndpoint = path.resolve(__dirname, 'src/connection/ws/BrowserClientWsEndpoint.ts')

const NodeClientWsConnection = path.resolve(__dirname, 'src/connection/ws/NodeClientWsConnection.ts')
const BrowserClientWsConnection = path.resolve(__dirname, 'src/connection/ws/BrowserClientWsConnection.ts')

module.exports = createKarmaConfig(TEST_PATHS, createWebpackConfig({
    entry: './src/exports-browser.ts',
    libraryName: 'network-node',
    alias: {
        [NodeWebRtcConnection]: BrowserWebRtcConnection,
        [NodeClientWsEndpoint]: BrowserClientWsEndpoint,
        [NodeClientWsConnection]: BrowserClientWsConnection
    }
}))
