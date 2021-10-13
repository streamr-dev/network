/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')
const fs = require('fs')

const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const LodashWebpackPlugin = require('lodash-webpack-plugin')
const { merge } = require('webpack-merge')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const { GitRevisionPlugin } = require('git-revision-webpack-plugin')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const pkg = require('./package.json')

const gitRevisionPlugin = new GitRevisionPlugin()

const libraryName = pkg.name

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production' || process.env.NODE_ENV === 'production'

    const analyze = !!process.env.BUNDLE_ANALYSIS

    const commonConfig = {
        cache: {
            type: 'filesystem',
        },
        name: 'streamr-client',
        mode: isProduction ? 'production' : 'development',
        entry: {
            'streamr-client': path.join(__dirname, 'src', 'index-browser.ts'),
        },
        devtool: 'source-map',
        output: {
            umdNamedDefine: true,
        },
        optimization: {
            minimize: false,
        },
        module: {
            rules: [
                {
                    test: /(\.jsx|\.js|\.ts)$/,
                    exclude: /(node_modules|bower_components)/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            configFile: path.resolve(__dirname, '.babel.browser.config.js'),
                            babelrc: false,
                            cacheDirectory: true,
                        }
                    }
                },
                {
                    test: /(\.jsx|\.js|\.ts)$/,
                    loader: 'eslint-loader',
                    exclude: /(node_modules|streamr-client-protocol|dist)/, // excluding streamr-client-protocol makes build work when 'npm link'ed
                },
            ],
        },
        resolve: {
            modules: [path.resolve('./node_modules'), path.resolve('./vendor'), path.resolve('./src')],
            extensions: ['.json', '.js', '.ts'],
        },
        plugins: [
            gitRevisionPlugin,
            new webpack.EnvironmentPlugin({
                NODE_ENV: process.env.NODE_ENV,
                version: pkg.version,
                GIT_VERSION: gitRevisionPlugin.version(),
                GIT_COMMITHASH: gitRevisionPlugin.commithash(),
                GIT_BRANCH: gitRevisionPlugin.branch(),
            })
        ],
        performance: {
            hints: 'warning',
        },
    }

    const clientConfig = merge({}, commonConfig, {
        target: 'web',
        output: {
            filename: '[name].web.js',
            libraryTarget: 'umd',
            library: 'StreamrClient',
            // NOTE:
            // exporting the class directly
            // `export default class StreamrClient {}`
            // becomes:
            // `window.StreamrClient === StreamrClient`
            // which is correct, but if we define the class and export separately,
            // which is required if we do interface StreamrClient extends …:
            // `class StreamrClient {}; export default StreamrClient;`
            // becomes:
            // `window.StreamrClient = { default: StreamrClient, … }`
            // which is wrong for browser builds.
            // see: https://github.com/webpack/webpack/issues/706#issuecomment-438007763
            //libraryExport: 'StreamrClient', // This fixes the above.
            globalObject: 'globalThis',
        },
        resolve: {
            modules: [
                'node_modules', // without this symlinked protocol won't find own dependencies
            ],
            alias: {
                stream: 'readable-stream',
                util: 'util',
                http: path.resolve(__dirname, './src/shim/http-https.js'),
                '@ethersproject/wordlists': path.resolve(__dirname, 'node_modules', '@ethersproject/wordlists/lib.esm/browser-wordlists.js'),
                https: path.resolve(__dirname, './src/shim/http-https.js'),
                crypto: path.resolve(__dirname, 'node_modules', 'crypto-browserify'),
                buffer: path.resolve(__dirname, 'node_modules', 'buffer'),
                'node-fetch': path.resolve(__dirname, './src/shim/node-fetch.js'),
                'node-webcrypto-ossl': path.resolve(__dirname, 'src/shim/crypto.js'),
                'streamr-client-protocol/dist/contracts/NodeRegistry.json': path.resolve(__dirname, 'node_modules/streamr-client-protocol/dist/contracts/NodeRegistry.json'),
                'streamr-client-protocol': path.resolve(__dirname, 'node_modules/streamr-client-protocol/dist/src'),
                //'streamr-network': path.resolve(__dirname, 'node_modules/streamr-network/src/browser.ts'),
                //[path.resolve(__dirname, 'node_modules/streamr-network/src/connection/NodeWebRtcConnection.ts')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/BrowserWebRtcConnection.ts'),
                //[path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/NodeClientWsEndpoint.ts')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/BrowserClientWsEndpoint.ts'),
                //[path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/NodeClientWsConnection.ts')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/BrowserClientWsConnection.ts'),
                'streamr-network': path.join(__dirname, '../network/src/browser.ts'),
                [path.join(__dirname, '../network/src/connection/NodeWebRtcConnection.ts$')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/BrowserWebRtcConnection.ts'),
                [path.join(__dirname, '../network/src/connection/ws/NodeClientWsEndpoint.ts$')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/BrowserClientWsEndpoint.ts'),
                [path.join(__dirname, '../network/src/connection/ws/NodeClientWsConnection.ts$')]: path.resolve(__dirname, 'node_modules/streamr-network/src/connection/ws/BrowserClientWsConnection.ts'),
                [path.join(__dirname, '../network/src/helpers/logger/LoggerNode.ts$')]: path.resolve(__dirname, 'node_modules/streamr-network/src/helpers/logger/LoggerBrowser.ts'),
                // swap out ServerPersistentStore for BrowserPersistentStore
                [path.resolve(__dirname, 'src/encryption/ServerPersistentStore')]: (
                    path.resolve(__dirname, 'src/encryption/BrowserPersistentStore')
                ),
            },
            fallback: {
                'module': false,
                'net': false,
                'http': false,
                'https': false,
                'express': false,
                'ws': false,
            }
        },
        plugins: [
            new NodePolyfillPlugin({
                excludeAliases: ['console'],
            }),
            new LodashWebpackPlugin(),
            ...(analyze ? [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    openAnalyzer: false,
                    generateStatsFile: true,
                })
            ] : [])
        ]
    })

    let clientMinifiedConfig

    if (isProduction) {
        clientMinifiedConfig = merge({}, clientConfig, {
            cache: false,
            optimization: {
                minimize: true,
                minimizer: [
                    new TerserPlugin({
                        parallel: true,
                        terserOptions: {
                            ecma: 2018,
                            output: {
                                comments: false,
                            },
                        },
                    }),
                ],
            },
            output: {
                filename: '[name].web.min.js',
            },
        })
    }
    return [clientConfig, clientMinifiedConfig].filter(Boolean)
}
