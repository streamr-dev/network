import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    testTimeout: 15_000,
    setupFilesAfterEnv: [
        ...defaultConfig.setupFilesAfterEnv,
        '@streamr/test-utils/setupCustomMatchers'
    ]
}

export default config
