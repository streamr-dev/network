const defaultConfig = require('./webpack.config')
const path = require('path')

module.exports = (env, argv) => {
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
        }
    }
}
