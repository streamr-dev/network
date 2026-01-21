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
