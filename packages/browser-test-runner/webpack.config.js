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
                        exclude: [/(node_modules|simulation)/, /\.d\.ts$/],
                        use: [{
                            loader: 'ts-loader',
                            options: { configFile: 'tsconfig.browser.json' },
                        }]
                    }
                ],
            },
            plugins: [
                new NodePolyfillPlugin({
                    additionalAliases: [
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
                extensions: ['.ts', '.js'],
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
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                filename: `${libraryName}.js`,
                sourceMapFilename: `[name].[contenthash].js.map`,
                chunkFilename: '[id].[contenthash].js',
                path: path.resolve('.', 'dist'),
                library: libraryName,
                libraryTarget: 'umd2',
                umdNamedDefine: true,
            },
            externals: {
                'geoip-lite': 'commonjs geoip-lite',
                'node-datachannel': 'commonjs node-datachannel',
                'http': 'HTTP',
                'https': 'HTTPS',
                'express': 'Express',
                'process': 'process',
                'ws': 'WebSocket',
                'querystring': 'QueryString',
            }
        }
    }
}
