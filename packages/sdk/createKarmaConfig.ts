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
                '@streamr/dht': resolve(__dirname, '../dht/dist/exports-browser.cjs'),
                "@/createSignatureValidationWorker": resolve(__dirname, 'src/_karma/createSignatureValidationWorker.ts'),
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
        __dirname,
        {
            /**
             * Karma's Webpack copies workers from dist/workers to dist and hashes their names.
             * We need to serve these files so they're accessible during tests. Normally Karma
             * only serves test and setup files.
             */
            servedFiles: ['dist/*.mjs']
        }
    )
}
