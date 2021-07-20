const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

const externals = (env) => {
    const externals = {
        'geoip-lite': 'commonjs geoip-lite',
        'node-datachannel': 'commonjs node-datachannel'
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
        "fs": require.resolve('browserify-fs'),
        "/src/logic/LocationManager.ts": false,
        "module": false,
    }
    if (env === 'production') {
        return Object.assign(fallbacks, {
            'http': false,
            'https': false,
            'express': false,
            'ws': false,
            'net': false,
        })
    }
    return fallbacks
}

const aliases = (env) => {
    const aliases = {
        "process": "process/browser",
        [path.resolve(__dirname, "src/logic/LocationManager.ts")]:
            path.resolve(__dirname, "test/browser/LocationManager.ts"),
        [path.resolve(__dirname, "src/connection/NodeWebRtcConnection.ts")]:
            path.resolve(__dirname, "src/connection/BrowserWebRtcConnection.ts"),
        [path.resolve(__dirname, "src/connection/ws/NodeClientWsEndpoint.ts")]:
            path.resolve(__dirname, "src/connection/ws/BrowserClientWsEndpoint.ts"),
        [path.resolve(__dirname, "src/connection/ws/NodeClientWsConnection.ts")]:
            path.resolve(__dirname, "src/connection/ws/BrowserClientWsConnection.ts"),
    }
    if (env !== 'test') {
        return Object.assign(aliases, {
            [path.resolve(__dirname, "src/helpers/trackerHttpEndpoints.ts")]:
                false
        })
    }
    return aliases
}

module.exports = (env, _argv) => {
    if (!env) {
        env = 'production'
    }
    const commonConfig = {
        mode: 'development',
        entry: './src/composition.ts',
        module: {
            rules: [
                {
                    test: /\.ts?$/,
                    exclude: /(node_modules|streamr-client-protocol)/,
                    use: [{
                        loader: 'ts-loader',
                        options: {configFile: 'tsconfig.webpack.json'}
                    }]
                },
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
            alias: aliases(env),
            fallback: fallbacks(env)
        },
        output: {
            filename: 'browser-node-bundle.js',
            path: path.resolve(__dirname, 'dist'),
            library: 'StreamrNetwork',
            libraryTarget: 'umd2',
            umdNamedDefine: true,
        },
        externals: externals(env)
    }
    return commonConfig
}