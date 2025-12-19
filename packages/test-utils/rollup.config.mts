import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default defineConfig([
    nodejs(),
    nodejsTypes(),
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
                dir: './dist/src',
                entryFileNames: '[name].js',
                chunkFileNames: '[name].[hash].js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                dir: './dist/src',
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

function nodejsTypes(): RollupOptions {
    return {
        input: [
            './dist/src/index.d.ts',
            './dist/src/customMatchers.d.ts',
        ],
        output: [
            { dir: './dist/src' },
        ],
        plugins: [
            nodeResolve(),
            dts(),
        ],
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}
