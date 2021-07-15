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
            './test/browser/IntegrationBrowserWebRtcConnection.test.ts',
            './test/integration/**/!(NodeWebRtcConnection*).ts/',

            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts',
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/browser/BrowserWebRtcConnection.test.ts': ['webpack'],
            './test/browser/IntegrationBrowserWebRtcConnection.test.ts': ['webpack'],
            './test/integration/**/!(NodeWebRtcConnection*).ts/': ['webpack'],

            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*).ts': ['webpack'],
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
        webpack: require('./webpack.config.js')
    })
}