const webpackConfig = require('./webpack.config')

module.exports = function (config) {
    config.set({
        plugins: [
            'karma-electron',
            'karma-webpack',
            'karma-jasmine',
            'karma-spec-reporter',
            'karma-sourcemap-loader'
        ],
        basePath: '.',
        frameworks: ['jasmine'],
        reporters: ['spec'],
        files: [
            './karma-setup.js',
            './test/end-to-end/**/!(webrtc*|websocket*)',
            './test/integration/**',
            './test/unit/**',
           {
                pattern: '**/*.js.map',
                included: false
            }
           
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/**/*.ts': ['webpack','sourcemap'],
        },
        customLaunchers: {
            CustomElectron: {
                base: 'Electron',
                browserWindowOptions: {
                    webPreferences: {
                        contextIsolation: false,
                        preload: __dirname + '/preload.js',
                        webSecurity: false,
                        sandbox: false
                    },
                    show: false // set to true to show the electron window
                }
            }
        },
        browserDisconnectTimeout: 30000,
        browserNoActivityTimeout: 400000,
        browsers: ['CustomElectron'],
        client: {
            clearContext: false, // leave Jasmine Spec Runner output visible in browser
            useIframe: false,
        },
        singleRun: true,   //set to false to leave electron window open
        webpack: {
            ...webpackConfig('test'),
            entry: {}
        }
    })
}
