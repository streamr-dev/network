import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import cjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import copy from 'rollup-plugin-copy'

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
                file: './dist/exports-nodejs.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/exports-nodejs.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            json(),
            nodeResolve({
                preferBuiltins: true,
            }),
            cjs(),
            copy({
                targets: [
                    {
                        src: 'src/encryption/migrations/*',
                        dest: 'dist/encryption/migrations'
                    }
                ]
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
        input: './dist/src/index.d.ts',
        output: [
            { file: './dist/exports-nodejs.d.ts' },
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
