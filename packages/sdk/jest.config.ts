import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    globalSetup: './jest.setup.ts',
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        './test/test-utils/customMatchers.ts',
        '@streamr/test-utils/setupCustomMatchers',
    ],
}

export default config
