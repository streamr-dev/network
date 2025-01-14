/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const { createKarmaConfig, createWebpackConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    'test/unit/**/!(connectivityRequestHandler*).ts',
    './test/integration/**/!(DhtWith*|ReplicateData*|GeoIpConnectivityChecking*).ts/',
    './test/end-to-end/**/!(RecoveryFromFailedAutoCertification*|memory-leak*|GeoIpLayer0*).ts'
]

const NodeWebrtcConnection = path.resolve(__dirname, 'src/connection/webrtc/NodeWebrtcConnection.ts')
const BrowserWebrtcConnection = path.resolve(__dirname, 'src/connection/webrtc/BrowserWebrtcConnection.ts')
const NodeWebsocketClientConnection = path.resolve(
    __dirname,
    'src/connection/websocket/NodeWebsocketClientConnection.ts'
)
const BrowserWebsocketClientConnection = path.resolve(
    __dirname,
    'src/connection/websocket/BrowserWebsocketClientConnection.ts'
)

module.exports = createKarmaConfig(
    TEST_PATHS,
    createWebpackConfig({
        entry: './src/exports.ts',
        libraryName: 'dht',
        alias: {
            [NodeWebrtcConnection]: BrowserWebrtcConnection,
            [NodeWebsocketClientConnection]: BrowserWebsocketClientConnection
        }
    }),
    __dirname
)
