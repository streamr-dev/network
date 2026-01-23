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
        /**
         * @todo Our "browser" tests use the Node.js build of DHT package – needed
         * for WebSocket/Simulator stuff, but still, very confusing.
         */
        '@streamr/dht': resolve(__dirname, '../dht/dist/exports-nodejs.cjs'),
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
