const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

require('console-browserify')

console.log(__dirname)
module.exports = function (config) {
    config.set({
        debugMode: true,
        plugins: [
            'karma-electron',
            'karma-webpack',
            //'karma-jest',
            'karma-jasmine',
            'karma-spec-reporter'
        ],
        basePath: '.',
        //frameworks: ['jest'],
        //reporters: ['jest'],
        frameworks: ['jasmine'],
        reporters: ['spec'],
        
        //jest: {
        //    snapshotPath: '__snapshots__',
        //    testMatch: [
        //      '**/test/**/*.[jt]s?(x)',
        //      '**/?(*.)+(spec|test).[jt]s?(x)',
        //    ],
        //    testPathIgnorePatterns: ['**/node_modules/**'],
        //  },
          
        files: [
            './karma-setup.js',
            './test/browser/BrowserWebRtcConnection.test.ts',
            // './test/unit/MessageBuffer.test.ts',

            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts',
        ],
        preprocessors: {
            //'./bundle.js': ['webpack'], 
            './karma-setup.js': ['webpack'],
            './test/browser/BrowserWebRtcConnection.test.ts': ['webpack'],
            // './test/unit/MessageBuffer.test.ts': ['webpack'],

            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts': ['webpack'],
        //
        },
        customLaunchers: {
            CustomElectron: {
                base: 'Electron',
                browserWindowOptions: {
                    // DEV: More preferentially, should link your own `webPreferences` from your Electron app instead
                    webPreferences: {
                        // Preferred `preload` mechanism to expose `require`
                        contextIsolation: false,
                        preload: __dirname + '/preload.js'

                        // Alternative non-preload mechanism to expose `require`
                        /*
                        nodeIntegration: true,
                        contextIsolation: false,
                        */



                        // nativeWindowOpen is set to `true` by default by `karma-electron` as well, see #50
                    },
                }
            }
        },

        // Use our custom launcher
        browsers: ['CustomElectron'],
        client: {
            clearContext: false, // leave Jasmine Spec Runner output visible in browser
            useIframe: false
        },
        singleRun: true,
        webpack: {
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
                        path.resolve(__dirname, "test/browser/LocationManager.ts")
                },
                fallback: {
                    "fs": require.resolve('browserify-fs'),
                    //"console-browserify": require.resolve('console-browserify'),
                    "/src/logic/LocationManager.ts": false,
                    "module": false
                }
            },
            output: {
                filename: 'bundle.js',
                path: path.resolve(__dirname, 'dist'),
            },
            externals: {
                'uWebSockets.js': 'uWS',
                'ws': 'WebSocket',
                'geoip-lite': 'commonjs geoip-lite',
                'node-datachannel': 'commonjs node-datachannel'
            },
        }
    })
}