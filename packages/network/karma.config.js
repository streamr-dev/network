const path = require('path')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
const { BrowserWindow } = require('electron').remote

require('console-browserify')

module.exports = function (config) {
    config.set({
        plugins: [
            'karma-webpack',
            'karma-jasmine',
            'karma-chrome-launcher',
            'karma-electron'
        ],
        basePath: '',
        frameworks: ['jasmine'],
        files: [
            './karma-setup.js',
            './test/unit/BrowserWebRtcConnection.test.ts',
            './test/unit/WsEndpoint.test.ts',
            './test/unit/WebSocketServer.test.ts'
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/unit/BrowserWebRtcConnection.test.ts': ['webpack'],
            './test/unit/WsEndpoint.test.ts': ['webpack'],
            './test/unit/WebSocketServer.test.ts': ['webpack']

        },
        browsers: ['Electron'],
        client:{
            clearContext: false // leave Jasmine Spec Runner output visible in browser
        },
        webpack: {
            entry: './src/index.ts',
            mode: 'development',
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        exclude: /node_modules/,
                        use: [{loader: 'ts-loader',
                        options: {configFile: 'tsconfig.webpack.json'}
                        }]
                    },
                ],
            },
            plugins: [
                new NodePolyfillPlugin(),
            ],
            resolve: {
                extensions: ['.tsx', '.ts', '.js'],
                fallback: {
                    "fs": false,
                    "constants": false,
                    "assert": false,
                    "http": false,
                    "stream": false,
                    "util": false,
                    "module": false,
                    "graceful-fs": false,
                    //"NodeJS.Module": require.resolve('node-module-polyfill'),
                    //"module": require.resolve('node-module-polyfill'),
                    "console-browserify": require.resolve('console-browserify'),
                }
            },
            output: {
                filename: 'bundle.js',
                path: path.resolve(__dirname, 'dist'),
            },
            externals: {
                // 'uWebSockets.js': '@electron/remote uWebSockets.js',
                // 'websocket': '@electron/remote ws',
                'geoip-lite': 'commonjs geoip-lite',
                'node-datachannel': 'commonjs node-datachannel'
            },
        }
    })
}