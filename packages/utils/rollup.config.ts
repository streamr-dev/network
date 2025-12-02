import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import alias, { type Alias } from '@rollup/plugin-alias'
import resolve from '@rollup/plugin-node-resolve'

const nodejsAliases: Alias[] = [
    {
        find: '@crypto',
        replacement: './node/crypto.js',
    },
]

const browserAliases: Alias[] = [
    {
        find: '@crypto',
        replacement: './browser/crypto.js',
    },
    {
        find: 'os',
        replacement: './browser/os.js',
    },
    {
        find: 'path',
        replacement: 'path-browserify',
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
            resolve({ preferBuiltins: true, resolveOnly: () => false }),
        ],
    }
}

function browser(): RollupOptions {
    return {
        input: 'dist/browser/src/exports.js',
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
            resolve({ browser: true, resolveOnly: () => false }),
        ],
    }
}

function nodejsTypes(): RollupOptions {
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
            resolve(),
            dts(),
        ],
    }
}

function browserTypes(): RollupOptions {
    return {
        input: 'dist/browser/src/exports.d.ts',
        output: [
            {
                file: 'dist/browser/src/exports.d.ts',
            },
        ],
        plugins: [
            alias({
                entries: browserAliases,
            }),
            resolve({ browser: true }),
            dts(),
        ],
    }
}
