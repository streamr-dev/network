import type { Configuration } from 'webpack'
import * as defaultConfig from './webpack.config'
import { resolve } from 'path'

const karmaWebpackConfig: (env?: Record<string, unknown>, argv?: Record<string, unknown>) => Configuration = (env = {}, argv = {}) => {
    const config = defaultConfig(env, argv)

    return {
        ...config,
        resolve: {
            ...config.resolve,
            alias: {
                ...config.resolve.alias,
                '@jest/globals': resolve(__dirname, 'test/test-utils/jestGlobalsMock.ts')
            },
            fallback: {
                ...config.resolve.fallback,
                v8: false,
                'jest-leak-detector': false,
            }
        },
    } as Configuration
}

export default karmaWebpackConfig
