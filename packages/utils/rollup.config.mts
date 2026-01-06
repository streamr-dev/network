import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import alias, { type Alias } from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { fileURLToPath } from 'node:url'

const nodejsAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/nodejs/src/nodejs/', import.meta.url)
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
        input: './dist/nodejs/src/exports.js',
        output: [
            {
                format: 'es',
                file: './dist/exports-nodejs.mjs',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/exports-nodejs.cjs',
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
            /node_modules/,
            /@streamr\//,
        ],
    }
}

function browser(): RollupOptions {
    return {
        input: './dist/browser/src/exports-browser.js',
        output: [
            {
                format: 'es',
                file: './dist/exports-browser.mjs',
                sourcemap: true,
            },
            {
                format: 'cjs',
                file: './dist/exports-browser.cjs',
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
            /node_modules/,
            /@streamr\//,
        ],
    }
}

function nodejsTypes(): RollupOptions {
    return {
        input: './dist/nodejs/src/exports.d.ts',
        output: [
            {
                file: './dist/exports-nodejs.d.ts',
            },
        ],
        plugins: [
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve(),
            dts(),
        ],
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}

function browserTypes(): RollupOptions {
    return {
        input: './dist/browser/src/exports-browser.d.ts',
        output: [
            {
                file: './dist/exports-browser.d.ts',
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
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}
