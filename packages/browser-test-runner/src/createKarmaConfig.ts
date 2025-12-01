import fs from 'fs'

const DEBUG_MODE = process.env.BROWSER_TEST_DEBUG_MODE ?? false

export const createKarmaConfig = (
    testPaths: string[], webpackConfig: () => Record<string, any>, localDirectory: string
): (config: any) => any => {
    const setupFiles = [__dirname + '/karma-setup.js']
    const localSetupFile = localDirectory + '/karma-setup.js'
    if (fs.existsSync(localSetupFile)) {
        setupFiles.push(localSetupFile)
    }
    const preprocessors: Record<string, string[]> = {}
    setupFiles.forEach((f) => preprocessors[f] = ['webpack'])
    testPaths.forEach((f) => preprocessors[f] = ['webpack', 'sourcemap'])
    const baseWebpack = webpackConfig()
    return (config: any) => {
        config.set({
            plugins: [
                'karma-electron',
                'karma-webpack',
                'karma-jasmine',
                'karma-spec-reporter',
                'karma-sourcemap-loader'
            ],
            basePath: '.',
            frameworks: ['webpack', 'jasmine'],
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
                            sandbox: false,
                            nodeIntegration: true
                        },
                        show: DEBUG_MODE  // set to true to show the electron window
                    }
                }
            },
            browserDisconnectTimeout: 60000,
            browserNoActivityTimeout: 400000,
            browsers: ['CustomElectron'],
            client: {
                clearContext: false,  // leave Jasmine Spec Runner output visible in browser
                useIframe: false,
            },
            singleRun: !DEBUG_MODE,  //set to false to leave electron window open
            webpack: {
                ...baseWebpack,
                externals: {
                    ...(baseWebpack.externals ?? {}),
                    'expect': 'commonjs2 expect',
                    '@jest/expect-utils': 'commonjs2 @jest/expect-utils',
                    'pretty-format': 'commonjs2 pretty-format',
                    'jest-diff': 'commonjs2 jest-diff',
                },
            }
        })
    }
}
