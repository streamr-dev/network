import { defineConfig, type RollupOptions } from 'rollup'
import { dts } from 'rollup-plugin-dts'
import alias, { type Alias } from '@rollup/plugin-alias'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import cjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { fileURLToPath } from 'node:url'

const nodejsAliases: Alias[] = [
    {
        find: /^@\//,
        replacement: fileURLToPath(
            new URL('./dist/nodejs/src/nodejs/', import.meta.url)
        ),
    },
]

/**
 * Dependencies to bundle for browser builds. These need browser-compatible versions of their
 * sub-dependencies (e.g. `readable-stream` for `stream`). Bundling also ensures we use up-to-date
 * versions that work with modern bundlers.
 */
const bundledBrowserDeps = [
    /**
     * Unwrap `browserify-aes` to get to `cipher-base`, `create-hash`, `evp_bytestokey`.
     */
    'browserify-aes',

    /**
     * Unwrap `public-encrypt` to get to `browserify-rsa`, `create-hash`, `parse-asn1`,
     * `randombytes`.
     */
    'public-encrypt',

    /**
     * Unwrap `browserify-rsa` to get to `randombytes`.
     */
    'browserify-rsa',

    /**
     * Unwrap `parse-asn1` to get to `asn1.js`, `browserify-aes`, `evp_bytestokey`, `pbkdf2`.
     */
    'parse-asn1',

    /**
     * Unwrap `pbkdf2` to get to `create-hash`, `ripemd160`.
     */
    'pbkdf2',

    /**
     * Unwrap `evp_bytestokey` to get to `md5.js`.
     */
    'evp_bytestokey',

    /**
     * Unwrap `create-hash` to get to `cipher-base`, `md5.js`, `ripemd160`.
     */
    'create-hash',

    /**
     * Unwrap `md5.js` and 'ripemd160' to get to `hash-base`.
     */
    'md5.js',

    /**
     * Unwrap `cipher-base` to get to Node's `stream` used inside. For browser builds, we want
     * to swap it to `readable-stream` instead.
     */
    'cipher-base',

    /**
     * Additionally, we
     * - use custom implementation of `randombytes` for browser (see alias below),
     * - install `asn1.js` and `hash-base` as backward compatible direct dependencies to ensure
     *   we have browser-compatible versions.
     */
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
    {
        /**
         * Although `randombytes` has a browser build, it uses `global` keyword which
         * breaks some bundlers (e.g. Vite). Therefore, we use a custom one.
         */
        find: 'randombytes',
        replacement: fileURLToPath(
            new URL(
                './dist/browser/src/browser/randombytes.js',
                import.meta.url
            )
        ),
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
            alias({
                entries: nodejsAliases,
            }),
            nodeResolve({
                preferBuiltins: true,
            }),
        ],
        external: [/node_modules/, /@streamr\//],
    }
}

function browser(): RollupOptions {
    return {
        input: './dist/browser/src/exports-browser.js',
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
            alias({
                entries: browserAliases,
            }),
            cjs(),
            json(),
            nodeResolve({
                browser: true,
                preferBuiltins: false,
            }),
        ],
        external: (id: string) => {
            if (/@streamr\//.test(id)) {
                return true
            }
            if (id.includes('node_modules')) {
                return !bundledBrowserDeps.some((dep) =>
                    id.includes(`node_modules/${dep}`)
                )
            }
            return false
        },
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
        external: [/node_modules/, /@streamr\//],
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
        external: [/node_modules/, /@streamr\//],
    }
}
