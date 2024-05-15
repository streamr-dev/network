const fs = require('fs')

const DEBUG_MODE = process.env.BROWSER_TEST_DEBUG_MODE ?? false

module.exports = function(testPaths, webpackConfig, localDirectory) {
    const setupFiles = [__dirname + '/karma-setup.js']
    const localSetupFile = localDirectory + '/karma-setup.js'
    if (fs.existsSync(localSetupFile)) {
        setupFiles.push(localSetupFile)
    }
    const preprocessors = {}
    setupFiles.forEach((f) => preprocessors[f] = ['webpack'])
    testPaths.forEach((f) => preprocessors[f] = ['webpack', 'sourcemap'])
    return (config) => {
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
                ...setupFiles,
                ...testPaths
            ],
            preprocessors,
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
                        show: DEBUG_MODE // set to true to show the electron window
                    }
                }
            },
            browserDisconnectTimeout: 60000,
            browserNoActivityTimeout: 400000,
            browsers: ['CustomElectron'],
            client: {
                clearContext: false, // leave Jasmine Spec Runner output visible in browser
                useIframe: false,
                runInParent: true
            },
            singleRun: !DEBUG_MODE,   //set to false to leave electron window open
            webpack: {
                ...webpackConfig(),
                entry: {}
            }
        })
    }
}
