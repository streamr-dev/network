const path = require('path')
const webpack = require('webpack')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')

require('console-browserify')

module.exports = function (config) {
    config.set({
        debugMode: true,
        plugins: [
            'karma-electron',
            'karma-webpack',
            'karma-jasmine',
            'karma-spec-reporter'
        ],
        basePath: '.',
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
            './test/integration/browser-ws-endpoint.test.ts'
            // './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts',
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/browser/BrowserWebRtcConnection.test.ts': ['webpack'],
            './test/integration/browser-ws-endpoint.test.ts': ['webpack']
            // './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts': ['webpack'],
        },
        customLaunchers: {
            CustomElectron: {
                base: 'Electron',
                browserWindowOptions: {
                    // DEV: More preferentially, should link your own `webPreferences` from your Electron app instead
                    webPreferences: {
                        // Preferred `preload` mechanism to expose `require`
                        contextIsolation: false,
                        preload: __dirname + '/preload.js',
                        webSecurity: false,
                    },
                }
            }
        },

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
                        path.resolve(__dirname, "test/browser/LocationManager.ts"),
                    [path.resolve(__dirname, "src/connection/NodeWebRtcConnection.ts")]:
                        path.resolve(__dirname, "src/connection/BrowserWebRtcConnection.ts"),
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
    })
}