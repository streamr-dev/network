import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/nodejs/$1'
    },
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        './test/utils/customMatchers.ts',
    ],
}

export default config
