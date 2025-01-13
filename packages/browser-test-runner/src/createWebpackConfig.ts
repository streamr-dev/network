import path from 'path'
import webpack from 'webpack'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

export const createWebpackConfig = ({
    entry,
    libraryName,
    alias = {}
}: {
    entry: string
    libraryName: string
    alias: Record<string, string>
}): Record<string, any> => {
    return () => {
        return {
            cache: {
                type: 'filesystem'
            },
            mode: 'development',
            entry,
            devtool: 'eval-source-map',
            module: {
                rules: [
                    {
                        test: /\.ts?$/,
                        exclude: [/(node_modules|simulation)/, /\.d\.ts$/],
                        use: [
                            {
                                loader: 'ts-loader',
                                options: { configFile: 'tsconfig.browser.json' }
                            }
                        ]
                    }
                ]
            },
            plugins: [
                new NodePolyfillPlugin(),
                new webpack.ProvidePlugin({
                    process: 'process/browser'
                }),
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer']
                })
            ],
            resolve: {
                extensions: ['.ts', '.js'],
                alias: {
                    process: 'process/browser',
                    ...alias
                },
                fallback: {
                    fs: false,
                    module: false,
                    net: false,
                    timers: require.resolve('timers-browserify'),
                    os: false,
                    querystring: false,
                    zlib: require.resolve('browserify-zlib'),
                    tls: false
                }
            },
            output: {
                filename: `${libraryName}.js`,
                sourceMapFilename: `[name].[contenthash].js.map`,
                chunkFilename: '[id].[contenthash].js',
                path: path.resolve('.', 'dist'),
                library: libraryName,
                libraryTarget: 'umd2',
                umdNamedDefine: true
            },
            externals: {
                'geoip-lite': 'commonjs geoip-lite',
                'node-datachannel': 'commonjs node-datachannel',
                http: 'HTTP',
                https: 'HTTPS',
                express: 'Express',
                process: 'process',
                ws: 'WebSocket',
                querystring: 'QueryString'
            }
        }
    }
}
