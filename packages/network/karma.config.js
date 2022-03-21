const webpackConfig = require('./webpack.config')

module.exports = function (config) {
    config.set({
        plugins: [
            'karma-electron',
            'karma-webpack',
            'karma-jasmine',
            'karma-spec-reporter'
        ],
        basePath: '.',
        frameworks: ['jasmine'],
        reporters: ['spec'],
        files: [
            './karma-setup.js',
            './test/unit/NetworkNode.test.ts',
            './test/browser/BrowserWebRtcConnection.test.ts',
            './test/browser/IntegrationBrowserWebRtcConnection.test.ts',
            './test/integration/**/!(NodeWebRtcConnection*|tracker*|nodeMessageBuffering*|UnixSocketWsServer*|message-duplication*).ts/',
            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*|Speedometer*|deprecated-tracker-status*).ts',
        ],
        preprocessors: {
            './karma-setup.js': ['webpack'],
            './test/unit/NetworkNode.test.ts': ['webpack'],
            './test/browser/BrowserWebRtcConnection.test.ts': ['webpack'],
            './test/browser/IntegrationBrowserWebRtcConnection.test.ts': ['webpack'],
            './test/integration/**/!(NodeWebRtcConnection*|tracker*|nodeMessageBuffering*|UnixSocketWsServer*|message-duplication*).ts/': ['webpack'],
            './test/unit/**/!(LocationManager*|NodeWebRtcConnection*|WebRtcEndpoint*|Speedometer*|deprecated-tracker-status*).ts': ['webpack'],
        },
        customLaunchers: {
            CustomElectron: {
                base: 'Electron',
                browserWindowOptions: {
                    webPreferences: {
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
            ...webpackConfig('test'),
            entry: {}
        }
    })
}
