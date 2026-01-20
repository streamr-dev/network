import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    globalSetup: './jest.setup.ts',
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        './src/setupTsyringe.ts',
        './test/test-utils/customMatchers.ts',
        '@streamr/test-utils/setupCustomMatchers',
    ],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/_nodejs/$1",
    },
}

export default config
