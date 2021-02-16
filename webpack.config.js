/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const { merge } = require('webpack-merge')
const nodeExternals = require('webpack-node-externals')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const GitRevisionPlugin = require('git-revision-webpack-plugin')

const pkg = require('./package.json')

const gitRevisionPlugin = new GitRevisionPlugin()

const libraryName = pkg.name

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production' || process.env.NODE_ENV === 'production'

    const analyze = !!process.env.BUNDLE_ANALYSIS

    const commonConfig = {
        mode: isProduction ? 'production' : 'development',
        entry: path.join(__dirname, 'src', 'index.ts'),
        devtool: 'source-map',
        output: {
            path: path.join(__dirname, 'dist'),
            library: {
                root: 'StreamrClient',
                amd: libraryName,
            },
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
                            configFile: path.resolve(__dirname, '.babel.config.js'),
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
            modules: [path.resolve('./node_modules'), path.resolve('./src')],
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
        ]
    }

    const serverConfig = merge({}, commonConfig, {
        name: 'node-lib',
        target: 'node',
        externals: [nodeExternals()],
        output: {
            libraryTarget: 'commonjs2',
            filename: libraryName + '.nodejs.js',
        },
    })

    serverConfig.module.rules = [
        {
            test: /(\.jsx|\.js|\.ts)$/,
            exclude: /(node_modules|bower_components)/,
            use: {
                loader: 'babel-loader',
                options: {
                    cacheDirectory: true,
                    configFile: path.resolve(__dirname, '.babel.node.config.js'),
                    babelrc: false,
                }
            }
        },
        {
            test: /(\.jsx|\.js|\.ts)$/,
            loader: 'eslint-loader',
            exclude: /(node_modules|streamr-client-protocol|dist)/, // excluding streamr-client-protocol makes build work when 'npm link'ed
        },
    ]

    const clientConfig = merge({}, commonConfig, {
        name: 'browser-lib',
        target: 'web',
        output: {
            libraryTarget: 'umd2',
            filename: libraryName + '.web.js',
        },
        node: {
            stream: true,
            buffer: true,
        },
        resolve: {
            alias: {
                stream: 'readable-stream',
                http: path.resolve(__dirname, './src/shim/http-https.js'),
                https: path.resolve(__dirname, './src/shim/http-https.js'),
                ws: path.resolve(__dirname, './src/shim/ws.js'),
                buffer: path.resolve(__dirname, 'node_modules', 'buffer'),
                'node-fetch': path.resolve(__dirname, './src/shim/node-fetch.js'),
                'node-webcrypto-ossl': path.resolve(__dirname, 'src/shim/crypto.js'),
                'streamr-client-protocol': path.resolve(__dirname, 'node_modules/streamr-client-protocol/src'),
            }
        },
        plugins: [
            ...(analyze ? [
                new BundleAnalyzerPlugin({
                    analyzerMode: 'static',
                    openAnalyzer: false,
                    generateStatsFile: true,
                }),
            ] : [])
        ]
    })

    let clientMinifiedConfig = {}

    if (isProduction) {
        clientMinifiedConfig = merge({}, clientConfig, {
            name: 'browser-lib-min',
            optimization: {
                minimize: true,
                minimizer: [
                    new TerserPlugin({
                        cache: true,
                        parallel: true,
                        sourceMap: true,
                        terserOptions: {
                            ecma: 2015,
                            output: {
                                comments: false,
                            },
                        },
                    }),
                ],
            },
            output: {
                filename: libraryName + '.web.min.js',
            },
        })
    }

    return [serverConfig, clientConfig, clientMinifiedConfig]
}
