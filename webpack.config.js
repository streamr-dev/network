/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const { merge } = require('webpack-merge')
const nodeExternals = require('webpack-node-externals')

const pkg = require('./package.json')

const libraryName = pkg.name

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production' || env.NODE_ENV === 'production'

    const commonConfig = {
        mode: isProduction ? 'production' : 'development',
        entry: path.join(__dirname, 'src', 'index.js'),
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
            minimize: false
        },
        module: {
            rules: [
                {
                    test: /(\.jsx|\.js)$/,
                    exclude: /(node_modules|bower_components)/,
                    use: {
                        loader: 'babel-loader',
                    }
                },
                {
                    test: /(\.jsx|\.js)$/,
                    loader: 'eslint-loader',
                    exclude: /(node_modules|streamr-client-protocol|dist)/, // excluding streamr-client-protocol makes build work when 'npm link'ed
                },
            ],
        },
        resolve: {
            modules: [path.resolve('./node_modules'), path.resolve('./src')],
            extensions: ['.json', '.js'],
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
            }),
        ]
    }

    const serverConfig = merge({}, commonConfig, {
        target: 'node',
        externals: [nodeExternals()],
        output: {
            libraryTarget: 'commonjs2',
            filename: libraryName + '.nodejs.js',
        },
    })

    serverConfig.module.rules = [
        {
            test: /(\.jsx|\.js)$/,
            exclude: /(node_modules|bower_components)/,
            use: {
                loader: 'babel-loader',
                options: {
                    presets: [
                        ['@babel/preset-env', {
                            useBuiltIns: 'usage',
                            corejs: 3,
                            targets: {
                                node: true
                            },
                        }]
                    ],
                    plugins: [
                        'add-module-exports',
                        '@babel/plugin-transform-modules-commonjs',
                        ['@babel/plugin-proposal-class-properties', {
                            loose: false
                        }]
                    ]
                }
            }
        },
        {
            test: /(\.jsx|\.js)$/,
            loader: 'eslint-loader',
            exclude: /(node_modules|streamr-client-protocol|dist)/, // excluding streamr-client-protocol makes build work when 'npm link'ed
        },
    ]

    const clientConfig = merge({}, commonConfig, {
        target: 'web',
        output: {
            libraryTarget: 'umd2',
            filename: libraryName + '.web.js',
        },
        node: {
            stream: true,
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
            }
        },
    })

    let clientMinifiedConfig = {}

    if (isProduction) {
        clientMinifiedConfig = merge({}, clientConfig, {
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
