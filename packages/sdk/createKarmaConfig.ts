import {
    createKarmaConfig as createKarmaConfigUtil,
    createWebpackConfig,
} from '@streamr/browser-test-runner'
import { resolve } from 'node:path'

export function createKarmaConfig(testPaths: string[]): ReturnType<typeof createKarmaConfigUtil> {
    return createKarmaConfigUtil(
        testPaths,
        createWebpackConfig({
            libraryName: 'sdk',
            alias: {
                /**
                 * @todo Our "browser" tests use the Node.js build of DHT package – needed
                 * for WebSocket/Simulator stuff, but still, very confusing.
                 */
                '@streamr/dht': resolve(
                    __dirname,
                    '../dht/dist/exports-nodejs.cjs'
                ),

                '@jest/globals': resolve(
                    __dirname,
                    'test/test-utils/jestGlobalsMock.ts'
                ),
                '@': resolve(__dirname, 'src/_browser'),
            },
            fallback: {
                v8: false,
                module: false,
            },
            externals: {
                http: 'HTTP',
                ws: 'WebSocket',
                'node-datachannel': 'commonjs node-datachannel',
                express: 'Express',
                'node:stream/web': 'stream/web',
                'node:timers/promises': 'timers/promises',
            },
        }),
        __dirname
    )
}
