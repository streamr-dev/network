import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        './test/utils/customMatchers.ts',
    ],
}

export default config
