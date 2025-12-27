import { defineConfig } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import alias from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { fileURLToPath } from 'node:url'

const nodejsAliases = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./node/src/node/', import.meta.url)
        ),
    },
]

const browserAliases = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./browser/src/browser/', import.meta.url)
        ),
    },
    {
        find: 'os',
        replacement: fileURLToPath(
            new URL('./browser/src/browser/os.js', import.meta.url)
        ),
    },
    {
        find: 'path',
        replacement: 'path-browserify',
    },
    {
        find: 'stream',
        replacement: 'readable-stream',
    },
    {
        find: /^pino$/,
        replacement: 'pino/browser',
    },
]

export default defineConfig([
    nodejs(),
    nodejsTypes(),
    browser(),
    browserTypes(),
])

function nodejs() {
    return {
        input: 'dist/node/src/exports.js',
        output: [
            {
                format: 'es',
                file: 'dist/node/src/exports.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: 'dist/node/src/exports.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve({
                preferBuiltins: true,
            }),
        ],
        external: [
            /node_modules/
        ]
    }
}

function browser() {
    return {
        input: 'dist/browser/src/exports-browser.js',
        output: [
            {
                format: 'es',
                file: 'dist/browser/src/exports.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: 'dist/browser/src/exports.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            nodeResolve({ browser: true }),
        ],
        external: [
            /node_modules/
        ]
    }
}

function nodejsTypes() {
    return {
        input: 'dist/node/src/exports.d.ts',
        output: [
            {
                file: 'dist/node/src/exports.d.ts',
            },
        ],
        plugins: [
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve(),
            dts(),
        ],
    }
}

function browserTypes() {
    return {
        input: 'dist/browser/src/exports-browser.d.ts',
        output: [
            {
                file: 'dist/browser/src/exports.d.ts',
            },
        ],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            nodeResolve({ browser: true }),
            dts(),
        ],
    }
}
