import type { Config } from '@jest/types'
import defaultConfig from '../../jest.config'

const config: Config.InitialOptions = {
    ...defaultConfig,
    globalTeardown: './jest.teardown.ts',
    testTimeout: 10000,
}

export default config
