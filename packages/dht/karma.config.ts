import { resolve } from 'path'
import { createKarmaConfig, createWebpackConfig } from '@streamr/browser-test-runner'

const TEST_PATHS = [
    'test/unit/**/!(connectivityRequestHandler*).ts',
    './test/integration/**/!(DhtWith*|ReplicateData*|GeoIpConnectivityChecking*).ts/',
    './test/end-to-end/**/!(RecoveryFromFailedAutoCertification*|memory-leak*|GeoIpLayer0*).ts'
]

export default createKarmaConfig(
    TEST_PATHS,
    createWebpackConfig({
        libraryName: 'dht',
        alias: {
            /**
             * Our "browser" tests use the Node.js build of `autocertifier-client` package – needed
             * for certifications stuff, but still, very confusing.
             */
            '@streamr/autocertifier-client': resolve(__dirname, '../autocertifier-client/dist/exports-nodejs.cjs'),

            /**
             * Selectively alias only browser-specific implementations here. The rest stays in `nodejs/`
             * because these (like WebsocketServer) are needed for testing and running WebSocket-based
             * code in Electron environment.
             *
             * This also proves that the "browser" test are really nodejs-flavoured browser tests where
             * we still depend on NodeJS elements.
             */
            '@/WebrtcConnection': resolve(__dirname, 'src/browser/WebrtcConnection.ts'),
            '@/WebsocketClientConnection': resolve(__dirname, 'src/browser/WebsocketClientConnection.ts'),
            '@': resolve(__dirname, 'src/nodejs'),
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
