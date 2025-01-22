import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        '@streamr/test-utils/setupCustomMatchers',
    ],
    testTimeout: 15000,
}

export default config
