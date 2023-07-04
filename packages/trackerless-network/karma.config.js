/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const { createKarmaConfig, createWebpackConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = [
    './test/unit/**/*.ts',
    './test/integration/**/*.ts',
    './test/end-to-end/**/!(webrtc*|websocket*)',
]

module.exports = createKarmaConfig(TEST_PATHS, createWebpackConfig({
    entry: './src/exports.ts',
    libraryName: 'trackerless-network',
    alias: {
        [path.resolve(__dirname, '../dht/src/connection/WebRTC/NodeWebRtcConnection.ts')]:
            path.resolve(__dirname, '../dht/src/connection/WebRTC/BrowserWebRtcConnection.ts'),
        '@streamr/dht': path.resolve('../dht/src/exports.ts'),
        '@streamr/proto-rpc': path.resolve('../proto-rpc/src/exports.ts'),
    }
}))
