import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default defineConfig([
    nodejs(),
    ...nodejsTypes(),
])

function nodejs(): RollupOptions {
    return {
        input: [
            './dist/src/index.js',
            './dist/src/customMatchers.js',
            './dist/src/setupCustomMatchers.js',
        ],
        output: [
            {
                format: 'es',
                dir: './dist',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].[hash].js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                dir: './dist',
                entryFileNames: '[name].cjs',
                chunkFileNames: '[name].[hash].cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            nodeResolve({
                preferBuiltins: true,
            }),
        ],
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}

function nodejsTypes(): RollupOptions[] {
    return [
        {
            input: './dist/src/index.d.ts',
            output: [
                { file: './dist/index.d.ts' },
            ],
            plugins: [
                nodeResolve(),
                dts(),
            ],
            external: [
                /node_modules/,
                /@streamr\//,
            ],
        },
        {
            input: './dist/src/customMatchers.d.ts',
            output: [
                { file: './dist/customMatchers.d.ts' },
            ],
            plugins: [
                nodeResolve(),
                dts(),
            ],
            external: [
                /node_modules/,
                /@streamr\//,
            ],
        },
        {
            input: './dist/src/setupCustomMatchers.d.ts',
            output: [
                { file: './dist/setupCustomMatchers.d.ts' },
            ],
            plugins: [
                nodeResolve(),
                dts(),
            ],
            external: [
                /node_modules/,
                /@streamr\//,
            ],
            onwarn(warning, rollupWarn) {
                /**
                 * setupCustomMatchers.d.ts is an empty file, so rollup dts plugin
                 * generates an EMPTY_BUNDLE warning. We can safely ignore it.
                 */
                if (warning.code !== 'EMPTY_BUNDLE') {
                    rollupWarn(warning)
                }
            }
        }
    ]
}
