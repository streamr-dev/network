import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'

export default defineConfig([
    nodejs(),
    nodejsTypes(),
])

function nodejs(): RollupOptions {
    return {
        input: './dist/src/exports.js',
        output: [
            {
                format: 'es',
                file: './dist/exports.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/exports.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            json(),
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
        input: './dist/src/exports.d.ts',
        output: [
            { file: './dist/exports.d.ts' },
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
