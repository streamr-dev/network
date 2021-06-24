const webpack = require('webpack')
const path = require('path')

module.exports = function (config) {
    config.set({
        plugins: [
            'karma-webpack',
            'karma-jasmine',
            'karma-chrome-launcher',
        ],

        // base path that will be used to resolve all patterns (eg. files, exclude)
        basePath: '',

        // frameworks to use
        // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
        frameworks: ['jasmine'],

        // list of files / patterns to load in the browser
        // Here I'm including all of the the Jest tests which are all under the __tests__ directory.
        // You may need to tweak this patter to find your test files/
        files: ['test/unit/StreamManager.test.ts.ts'],

        // preprocess matching files before serving them to the browser
        // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
        preprocessors: {
            // Use webpack to bundle our tests files
            'test/unit/StreamManager.test.ts': ['webpack'],
        },
        files: ['./karma-setup.js', 'test/unit/StreamManager.test.ts'],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            'test/unit/StreamManager.test.ts': ['webpack'],
        },
        browsers: ['ChromeHeadless'],
        webpack: {
            // Your webpack config here
            entry: './src/index.ts',
            mode: 'development',
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        use: 'ts-loader',
                        exclude: /node_modules/,
                    },
                ],
            },
            resolve: {
                extensions: ['.tsx', '.ts', '.js'],
                fallback: {
                    "fs": false,
                    "events": false,
                    "path": false,
                    "constants": false,
                    "assert": false,
                //     "http": false,
                    "stream": false,
                    "util": false,
                    "module": false,
                //     "child-process": false,
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