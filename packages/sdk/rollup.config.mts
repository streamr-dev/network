import { defineConfig, type RollupLog, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import cjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import copy from 'rollup-plugin-copy'
import terser from '@rollup/plugin-terser'
import alias, { type Alias } from '@rollup/plugin-alias'
import { fileURLToPath } from 'node:url'

const nodejsAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/nodejs/src/_nodejs/', import.meta.url)
        ),
    },
]

const browserAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/browser/src/_browser/', import.meta.url)
        ),
    },
    { find: 'timers', replacement: 'timers-browserify' },
]

export default defineConfig([
    nodejs(),
    nodejsTypes(),
    browser(),
    browserTypes(),
    umd(),
    umdMinified(),
])

function onwarn(log: RollupLog, rollupWarn: (log: RollupLog) => void): void {
    // Suppress circular dependency warnings from external libraries
    if (
        log.code === 'CIRCULAR_DEPENDENCY' &&
        /node_modules/.test(log.message ?? '')
    ) {
        return
    }

    rollupWarn(log)
}

function nodejs(): RollupOptions {
    return {
        input: './dist/nodejs/src/exports.js',
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
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve({
                preferBuiltins: true,
            }),
            cjs(),
            copy({
                targets: [
                    {
                        src: 'src/encryption/migrations/*',
                        dest: 'dist/encryption/migrations',
                    },
                ],
            }),
        ],
        external: [/node_modules/, /@streamr\//],
        onwarn,
    }
}

function nodejsTypes(): RollupOptions {
    return {
        input: './dist/nodejs/src/index.d.ts',
        output: [{ file: './dist/exports-nodejs.d.ts' }],
        plugins: [
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve(),
            dts(),
        ],
        external: [/node_modules/, /@streamr\//],
    }
}

function browser(): RollupOptions {
    return {
        input: './dist/browser/src/exports.js',
        output: [
            {
                format: 'es',
                file: './dist/exports-browser.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/exports-browser.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            json(),
            alias({
                entries: browserAliases,
            }),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
            cjs(),
        ],
        external: [/node_modules/, /@streamr\//],
        onwarn,
    }
}

function browserTypes(): RollupOptions {
    return {
        input: './dist/browser/src/index.d.ts',
        output: [{ file: './dist/exports-browser.d.ts' }],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            nodeResolve(),
            dts(),
        ],
        external: [/node_modules/, /@streamr\//],
    }
}

function umd(): RollupOptions {
    return {
        input: './dist/browser/src/exports.js',
        context: 'window',
        output: {
            format: 'umd',
            name: 'StreamrClient',
            file: './dist/streamr-client.umd.js',
            sourcemap: true,
        },
        plugins: [
            json(),
            alias({
                entries: browserAliases,
            }),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
            cjs(),
        ],
        external: [],
        onwarn,
    }
}

function umdMinified(): RollupOptions {
    return {
        input: './dist/browser/src/exports.js',
        context: 'window',
        output: {
            format: 'umd',
            name: 'StreamrClient',
            file: './dist/streamr-client.umd.min.js',
            sourcemap: true,
        },
        plugins: [
            json(),
            alias({
                entries: browserAliases,
            }),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
            cjs(),
            terser(),
        ],
        external: [],
        onwarn,
    }
}
