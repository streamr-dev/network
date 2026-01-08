import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default defineConfig([
    nodejs(),
    nodejsTypes(),
    browser(),
    browserTypes(),
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
            {
                file: './dist/exports-nodejs.d.ts',
            },
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

function browser(): RollupOptions {
    return {
        input: './dist/src/exports-browser.js',
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
            nodeResolve({
                preferBuiltins: false,
                browser: true,
            }),
        ],
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}

function browserTypes(): RollupOptions {
    return {
        input: './dist/src/exports-browser.d.ts',
        output: [
            {
                file: './dist/exports-browser.d.ts',
            },
        ],
        plugins: [
            nodeResolve({
                preferBuiltins: false,
                browser: true,
            }),
            dts(),
        ],
        external: [
            /node_modules/,
            /@streamr\//,
        ],
    }
}
