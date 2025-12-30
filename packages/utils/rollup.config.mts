import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import alias, { type Alias } from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { fileURLToPath } from 'node:url'

const nodejsAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/node/src/node/', import.meta.url)
        ),
    },
]

const browserAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/browser/src/browser/', import.meta.url)
        ),
    },
    {
        find: 'os',
        replacement: fileURLToPath(
            new URL('./dist/browser/src/browser/os.js', import.meta.url)
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

function nodejs(): RollupOptions {
    return {
        input: './dist/node/src/exports.js',
        output: [
            {
                format: 'es',
                file: './dist/node/src/exports.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/node/src/exports.cjs',
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

function browser(): RollupOptions {
    return {
        input: './dist/browser/src/exports-browser.js',
        output: [
            {
                format: 'es',
                file: './dist/browser/src/exports.js',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/browser/src/exports.cjs',
                sourcemap: true,
            },
        ],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
        ],
        external: [
            /node_modules/
        ]
    }
}

function nodejsTypes(): RollupOptions {
    return {
        input: './dist/node/src/exports.d.ts',
        output: [
            {
                file: './dist/node/src/exports.d.ts',
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

function browserTypes(): RollupOptions {
    return {
        input: './dist/browser/src/exports-browser.d.ts',
        output: [
            {
                file: './dist/browser/src/exports.d.ts',
            },
        ],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
            dts(),
        ],
    }
}
