import fs from 'fs'
import { fileURLToPath } from 'url'
import type { Configuration, ExternalItem } from 'webpack'

const DEBUG_MODE = process.env.BROWSER_TEST_DEBUG_MODE ?? false

export const createKarmaConfig = (
    testPaths: string[], webpackConfig: () => Configuration, localDirectory?: string
): (config: any) => any => {
    const setupFiles = [fileURLToPath(new URL('./karma-setup.js', import.meta.url))]

    if (localDirectory !== undefined) {
        const karmaSetupCandidates = [
            `${localDirectory}/karma-setup.js`,
            `${localDirectory}/karma-setup.ts`
        ]

        for (const candidate of karmaSetupCandidates) {
            if (fs.existsSync(candidate)) {
                setupFiles.push(candidate)
                break
            }
        }
    }

    const preprocessors: Record<string, string[]> = {}
    setupFiles.forEach((f) => preprocessors[f] = ['webpack'])
    testPaths.forEach((f) => preprocessors[f] = ['webpack', 'sourcemap'])
    const baseWebpack = webpackConfig()

    const mergedExternals: ExternalItem[] = []
    if (baseWebpack.externals !== undefined) {
        if (Array.isArray(baseWebpack.externals)) {
            mergedExternals.push(...baseWebpack.externals)
        } else {
            mergedExternals.push(baseWebpack.externals)
        }
    }
    mergedExternals.push({
        'expect': 'commonjs2 expect',
        '@jest/expect-utils': 'commonjs2 @jest/expect-utils',
        'pretty-format': 'commonjs2 pretty-format',
        'jest-diff': 'commonjs2 jest-diff',
    })

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
                            preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
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
                externals: mergedExternals,
            }
        })
    }
}
