const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

module.exports = function({ entry, libraryName, alias = {} }) {
    return () => {
        return {
            cache: {
                type: 'filesystem',
            },
            mode: 'development',
            entry,
            devtool: 'eval-source-map',
            module: {
                rules: [
                    {
                        test: /\.ts?$/,
                        exclude: /(node_modules|simulation)/,
                        use: [{
                            loader: 'ts-loader',
                            options: { configFile: 'tsconfig.browser.json', transpileOnly: true },
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
                }),
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer']
                }),
            ],
            resolve: {
                extensions: ['.cts', '.ts', '.cjs', '.js'],
                alias: {
                    'process': 'process/browser',
                    ...alias
                },
                fallback: {
                    'fs': false,
                    'module': false,
                    'net': false,
                    'timers': require.resolve('timers-browserify'),
                    'os': false,
                    'querystring': false,
                    'zlib': require.resolve('browserify-zlib'),
                    'tls': false
                }
            },
            output: {
                filename: `${libraryName}.js`,
                sourceMapFilename: `[name].[contenthash].js.map`,
                chunkFilename: '[id].[contenthash].js',
                path: path.resolve('.', 'dist'),
                library: libraryName,
                libraryTarget: 'umd2',
                umdNamedDefine: true,
            },
            externals: {
                'http': 'HTTP',
                'https': 'HTTPS',
                'express': 'Express',
                'process': 'process',
                'node-datachannel': 'NodeDataChannel',
                'querystring': 'QueryString',
            }
        }
    }
}
