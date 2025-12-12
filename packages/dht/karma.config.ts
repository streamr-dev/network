import { resolve } from 'path'
import { createKarmaConfig, createWebpackConfig } from '@streamr/browser-test-runner'

const TEST_PATHS = [
    'test/unit/**/!(connectivityRequestHandler*).ts',
    './test/integration/**/!(DhtWith*|ReplicateData*|GeoIpConnectivityChecking*).ts/',
    './test/end-to-end/**/!(RecoveryFromFailedAutoCertification*|memory-leak*|GeoIpLayer0*).ts'
]

const NodeWebrtcConnection = resolve(__dirname, 'src/connection/webrtc/NodeWebrtcConnection.ts')
const BrowserWebrtcConnection = resolve(__dirname, 'src/connection/webrtc/BrowserWebrtcConnection.ts')
const NodeWebsocketClientConnection = resolve(__dirname, 'src/connection/websocket/NodeWebsocketClientConnection.ts')
const BrowserWebsocketClientConnection = resolve(__dirname, 'src/connection/websocket/BrowserWebsocketClientConnection.ts')

export default createKarmaConfig(
    TEST_PATHS,
    createWebpackConfig({
        libraryName: 'dht',
        alias: {
            [NodeWebrtcConnection]: BrowserWebrtcConnection,
            [NodeWebsocketClientConnection]: BrowserWebsocketClientConnection
        },
        fallback: {
            module: false
        },
        externals: {
            http: 'HTTP',
            ws: 'WebSocket',
            'node-datachannel': 'commonjs node-datachannel',
        }
    }),
    __dirname
)
