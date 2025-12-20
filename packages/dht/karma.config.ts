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
            '@': resolve(__dirname, 'src/browser'),
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
