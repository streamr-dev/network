const DEBUG_MODE = process.env.BROWSER_TEST_DEBUG_MODE ?? false

module.exports = function(testPaths, webpackConfig) {
    const karmaSetupJs = __dirname + '/karma-setup.js'
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
                karmaSetupJs,
                ...testPaths
            ],
            preprocessors: testPaths.reduce((mem, el) => { mem[el] = ['webpack', 'sourcemap']; return mem }, {
                [karmaSetupJs]: ['webpack']
            }),
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
            browserDisconnectTimeout: 30000,
            browserNoActivityTimeout: 400000,
            browsers: ['CustomElectron'],
            client: {
                clearContext: false, // leave Jasmine Spec Runner output visible in browser
                useIframe: false,
            },
            singleRun: !DEBUG_MODE,   //set to false to leave electron window open
            webpack: {
                ...webpackConfig(),
                entry: {}
            }
        })
    }
}
