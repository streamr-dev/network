const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

module.exports = {
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.ts?$/,
                exclude: [
                    '/node_modules/',
                ],
                use: [{
                    loader: 'ts-loader',
                    options: { configFile: 'tsconfig.webpack.json' }
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
        alias: {
            "process": "process/browser",
            [path.resolve(__dirname, "src/logic/LocationManager.ts")]:
                path.resolve(__dirname, "test/browser/LocationManager.ts"),
            [path.resolve(__dirname, "src/connection/NodeWebRtcConnection.ts")]:
                path.resolve(__dirname, "src/connection/BrowserWebRtcConnection.ts"),
            [path.resolve(__dirname, "src/connection/ws/NodeClientWsEndpoint.ts")]:
                path.resolve(__dirname, "src/connection/ws/BrowserClientWsEndpoint.ts"),
            [path.resolve(__dirname, "src/connection/ws/NodeClientWsConnection.ts")]:
                path.resolve(__dirname, "src/connection/ws/BrowserClientWsConnection.ts"),
        },
        fallback: {
            "fs": require.resolve('browserify-fs'),
            "/src/logic/LocationManager.ts": false,
            "module": false
        }
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    externals: {
        'http': 'HTTP',
        'https': 'HTTPS',
        'express': 'Express',
        'ws': 'WebSocket',
        'geoip-lite': 'commonjs geoip-lite',
        'node-datachannel': 'commonjs node-datachannel'
    },
}