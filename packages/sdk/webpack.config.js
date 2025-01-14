process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const { merge } = require('webpack-merge')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const { GitRevisionPlugin } = require('git-revision-webpack-plugin')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const pkg = require('./package.json')

const gitRevisionPlugin = new GitRevisionPlugin()

module.exports = (env, argv) => {
    const isProduction = argv?.mode === 'production' || process.env.NODE_ENV === 'production'

    const analyze = !!process.env.BUNDLE_ANALYSIS

    const commonConfig = {
        cache: {
            type: 'filesystem'
        },
        name: 'streamr-sdk',
        mode: isProduction ? 'production' : 'development',
        entry: {
            'streamr-sdk': path.join(__dirname, 'src', 'exports-browser.ts')
        },
        devtool: 'source-map',
        output: {
            umdNamedDefine: true
        },
        optimization: {
            minimize: false,
            moduleIds: 'named'
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
                            cacheDirectory: true
                        }
                    }
                }
            ]
        },
        resolve: {
            modules: ['node_modules', ...require.resolve.paths('')],
            extensions: ['.json', '.js', '.ts']
        },
        plugins: [
            gitRevisionPlugin,
            new webpack.EnvironmentPlugin({
                NODE_ENV: process.env.NODE_ENV,
                version: pkg.version,
                GIT_VERSION: gitRevisionPlugin.version(),
                GIT_COMMITHASH: gitRevisionPlugin.commithash(),
                GIT_BRANCH: gitRevisionPlugin.branch()
            }),
            new webpack.optimize.LimitChunkCountPlugin({
                maxChunks: 1
            })
        ],
        performance: {
            hints: 'warning'
        }
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
            // libraryExport: 'StreamrClient', // This fixes the above.
            globalObject: 'globalThis'
        },
        resolve: {
            alias: {
                stream: 'readable-stream',
                util: 'util',
                buffer: require.resolve('buffer/'),
                '@streamr/test-utils': path.resolve('../test-utils/src/index.ts'),
                '@streamr/utils': path.resolve('../utils/src/exports.ts'),
                '@streamr/protocol': path.resolve('../protocol/src/exports.ts'),
                '@streamr/trackerless-network': path.resolve('../trackerless-network/src/exports.ts'),
                '@streamr/dht': path.resolve('../dht/src/exports.ts'),
                '@streamr/autocertifier-client': false,
                [path.resolve(__dirname, '../dht/src/connection/webrtc/NodeWebrtcConnection.ts')]: path.resolve(
                    __dirname,
                    '../dht/src/connection/webrtc/BrowserWebrtcConnection.ts'
                ),
                [path.resolve(__dirname, '../dht/src/connection/websocket/NodeWebsocketClientConnection.ts')]:
                    path.resolve(__dirname, '../dht/src/connection/websocket/BrowserWebsocketClientConnection.ts'),
                [path.resolve(__dirname, '../dht/src/helpers/browser/isBrowserEnvironment.ts')]: path.resolve(
                    __dirname,
                    '../dht/src/helpers/browser/isBrowserEnvironment_override.ts'
                ),
                // swap out ServerPersistence for BrowserPersistence
                [path.resolve('./src/utils/persistence/ServerPersistence.ts')]: path.resolve(
                    './src/utils/persistence/BrowserPersistence.ts'
                )
            },
            fallback: {
                module: false,
                fs: false,
                net: false,
                http: false,
                https: false,
                express: false,
                ws: false,
                'jest-leak-detector': false,
                v8: false,
                '@web3modal/standalone': false
            }
        },
        plugins: [
            new NodePolyfillPlugin({
                excludeAliases: ['console']
            }),
            ...(analyze
                ? [
                      new BundleAnalyzerPlugin({
                          analyzerMode: 'static',
                          openAnalyzer: false,
                          generateStatsFile: true
                      })
                  ]
                : []),
            new webpack.ProvidePlugin({
                process: 'process/browser',
                Buffer: ['buffer', 'Buffer']
            }),
            new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
                const library = resource.request.replace(/^node:/, '')
                if (library === 'buffer') {
                    resource.request = 'buffer'
                } else if (library === 'stream/web') {
                    resource.request = false
                }
            })
        ],
        externals: {
            express: 'Express',
            'node:stream/web': 'stream/web',
            'node:timers/promises': 'timers/promises'
        }
    })

    if (!isProduction) {
        return clientConfig
    } else {
        return merge({}, clientConfig, {
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
                                ascii_only: true
                            }
                        }
                    })
                ]
            },
            output: {
                filename: '[name].web.min.js'
            }
        })
    }
}
