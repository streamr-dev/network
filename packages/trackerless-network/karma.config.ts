import { resolve } from 'path'
import { createKarmaConfig, createWebpackConfig } from '@streamr/browser-test-runner'

const TEST_PATHS = [
    './test/unit/**/*.ts',
    './test/integration/**/*.ts',
    './test/end-to-end/**/!(webrtc*|websocket*)',
]

export default createKarmaConfig(TEST_PATHS, createWebpackConfig({
    libraryName: 'trackerless-network',
    alias: {
        [resolve(__dirname, '../dht/src/connection/webrtc/NodeWebrtcConnection.ts')]:
            resolve(__dirname, '../dht/src/connection/webrtc/BrowserWebrtcConnection.ts'),
        [resolve(__dirname, '../dht/src/connection/websocket/NodeWebsocketClientConnection.ts')]:
            resolve(__dirname, '../dht/src/connection/websocket/BrowserWebsocketClientConnection.ts'),
        '@streamr/dht': resolve('../dht/src/exports.ts'),
        '@streamr/proto-rpc': resolve('../proto-rpc/src/exports.ts'),
    },
    fallback: {
        module: false
    },
    externals: {
        'node-datachannel': 'commonjs node-datachannel',
        express: 'Express',
        http: 'HTTP',
        ws: 'WebSocket',
    }
}), __dirname)
