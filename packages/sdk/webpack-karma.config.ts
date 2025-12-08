import type { Configuration } from 'webpack'
import defaultConfig from './webpack.config'
import path from 'path'

const karmaWebpackConfig: (env?: Record<string, unknown>, argv?: Record<string, unknown>) => Configuration = (env = {}, argv = {}) => {
    const config = defaultConfig(env, argv)

    return {
        ...config,
        resolve: {
            ...config.resolve,
            alias: {
                ...config.resolve.alias,
                '@jest/globals': path.resolve(__dirname, 'test/test-utils/jestGlobalsMock.ts')
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
