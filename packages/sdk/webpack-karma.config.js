const defaultConfig = require('./webpack.config')

module.exports = (env, argv) => {
    const config = defaultConfig(env, argv)

    return {
        ...config,
        resolve: {
            ...config.resolve,
            fallback: {
                ...config.resolve.fallback,
                v8: false,
                'jest-leak-detector': false,
            }
        }
    }
}
