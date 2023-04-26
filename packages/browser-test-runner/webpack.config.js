/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

module.exports = function(entry, libraryName) {
    return (env, argv) => {
        return {
            cache: {
                type: 'filesystem',
            },
            mode: 'development',
            entry,
            devtool: "source-map",
            module: {
                rules: [
                    {
                        test: /\.ts?$/,
                        exclude: /(node_modules|simulation)/,
                        use: [{
                            loader: 'ts-loader',
                            options: { configFile: 'tsconfig.browser.json' },
                        }]
                    }
                ],
            },
            plugins: [
                new NodePolyfillPlugin({
                    includeAliases: [
                        'constants',
                        'crypto',
                        'path',
                        'process',
                        'stream'
                    ]
                }),
                new webpack.ProvidePlugin({
                    process: 'process/browser'
                })
            ],
            resolve: {
                extensions: ['.tsx', '.ts', '.js'],
                alias: {
                    'process': 'process/browser'
                },
                fallback: {
                    'fs': false,
                    'module': false,
                    'net': false
                }
            },
            output: {
                filename: `${libraryName}.js`,
                sourceMapFilename: `[name].[contenthash].js.map`,
                chunkFilename: '[id].[contenthash].js',
                path: path.resolve('.', 'dist'),
                library: 'utils',
                libraryTarget: 'umd2',
                umdNamedDefine: true,
            },
            externals: {
                'node-datachannel': 'commonjs node-datachannel',
                'http': 'HTTP',
                'https': 'HTTPS',
                'express': 'Express',
                'process': 'process'
            }
        }
    }
}
