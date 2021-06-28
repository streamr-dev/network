const path = require('path')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
require('console-browserify')

module.exports = function (config) {
    config.set({
        plugins: [
            'karma-webpack',
            'karma-jasmine',
            'karma-chrome-launcher',
        ],
        basePath: '',
        frameworks: ['jasmine'],
        files: [
            './karma-setup.js',
            './test/unit/BrowserWebRtcConnection.test.ts',
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/unit/BrowserWebRtcConnection.test.ts': ['webpack'],
        },
        browsers: ['ChromeHeadless'],
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
                    //"NodeJS.Module": require.resolve('node-module-polyfill'),
                    //"module": require.resolve('node-module-polyfill'),
                    "console-browserify": require.resolve('console-browserify')
                }
            },
            output: {
                filename: 'bundle.js',
                path: path.resolve(__dirname, 'dist'),
            },
            externals: {
                'uWebSockets.js': 'commonjs uWebSockets.js',
                'geoip-lite': 'commonjs geoip-lite',
                'node-datachannel': 'commonjs node-datachannel'
            },
        }
    })
}