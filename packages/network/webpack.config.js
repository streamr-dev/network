const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const pkg = require('./package.json')
const libraryName = pkg.name

const externals = (env) => {
    const externals = {
        'geoip-lite': 'commonjs geoip-lite',
        'node-datachannel': 'commonjs node-datachannel',
    }
    if (env === 'test') {
        return Object.assign(externals, {
            'http': 'HTTP',
            'https': 'HTTPS',
            'express': 'Express',
            'ws': 'WebSocket'
        })
    }
    return externals
}

const fallbacks = (env) => {
    const fallbacks = {
        'fs': require.resolve('browserify-fs'),
        'module': false,
        'net': false
    }
    if (env === 'production') {
        return Object.assign(fallbacks, {
            'http': false,
            'https': false,
            'express': false,
            'ws': false,
        })
    }
    return fallbacks
}

const aliases = (env) => {
    const aliases = {
        'process': 'process/browser',
        [path.resolve(__dirname, 'src/connection/webrtc/NodeWebRtcConnection.ts')]:
            path.resolve(__dirname, 'src/connection/webrtc/BrowserWebRtcConnection.ts'),
        [path.resolve(__dirname, 'src/connection/ws/NodeClientWsEndpoint.ts')]:
            path.resolve(__dirname, 'src/connection/ws/BrowserClientWsEndpoint.ts'),
        [path.resolve(__dirname, 'src/connection/ws/NodeClientWsConnection.ts')]:
            path.resolve(__dirname, 'src/connection/ws/BrowserClientWsConnection.ts'),
        ['@pm2/io']: path.resolve(__dirname, 'src/browser/Pm2Shim.ts'),
        'streamr-network': path.resolve('../network-tracker/src/browser.ts'),
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
        entry: './src/browser.ts',
        devtool: "source-map",
        module: {
            rules: [
                {
                    test: /\.ts?$/,
                    exclude: /(node_modules|streamr-client-protocol)/,
                    use: [{
                        loader: 'ts-loader',
                        options: { configFile: 'tsconfig.webpack.json' },
                    }]
                }
            ],
        },
        plugins: [
            new NodePolyfillPlugin(),
            new webpack.ProvidePlugin({
                process: 'process/browser',
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
            library: 'StreamrNetwork',
            libraryTarget: 'umd2',
            umdNamedDefine: true,
        },
        externals: externals(environment)
    }
    return config
}
