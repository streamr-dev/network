const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const pkg = require('./package.json')
const libraryName = pkg.name

const externals = (env) => {
    const externals = {
        'node-datachannel': 'commonjs node-datachannel',
        'http': 'HTTP',
        'https': 'HTTPS',
        'express': 'Express',
        'process': 'process'
    }
    return externals
}

const fallbacks = (env) => {
    const fallbacks = {
        'fs': false,
        'module': false,
        'net': false
    }
    if (env === 'production') {
        return Object.assign(fallbacks, {
            'http': false,
            'https': false,
            'express': false,
            'websocket': false,
        })
    }
    return fallbacks
}

const aliases = (env) => {
    const aliases = {
        'process': 'process/browser',
        [path.resolve(__dirname, '../dht/src/connection/WebRTC/NodeWebRtcConnection.ts')]:
            path.resolve(__dirname, '../dht/src/connection/WebRTC/BrowserWebRtcConnection.ts'),
        '@streamr/dht': path.resolve('../dht/src/exports.ts'),
        '@streamr/proto-rpc': path.resolve('../proto-rpc/src/exports.ts'),
    }
    return aliases
}

module.exports = (env, argv) => {
    let environment = 'development'

    if (env === 'test' || argv.mode === 'test' || process.env.node_env === 'test') {
        environment = 'test'
    }
    const isProduction = environment === 'production'

    const config = {
        cache: {
            type: 'filesystem',
        },
        mode: isProduction ? 'production' : 'development',
        entry: './src/exports.ts',
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
                Buffer: ['buffer', 'Buffer']
            }),
            new webpack.ProvidePlugin({
                process: 'process/browser'
            })
        ],
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            alias: aliases(environment),
            fallback: fallbacks(environment)
        },
        output: {
            filename: `${libraryName}.js`,
            sourceMapFilename: `[name].[contenthash].js.map`,
            chunkFilename: '[id].[contenthash].js',
            path: path.resolve(__dirname, 'dist'),
            library: 'TrackerlessNetwork',
            libraryTarget: 'umd2',
            umdNamedDefine: true,
        },
        externals: externals(environment)
    }
    return config
}
