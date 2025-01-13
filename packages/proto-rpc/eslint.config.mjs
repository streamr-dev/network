import baseConfig from '../../eslint.config.mjs'

export default [
    {
        ignores: ['test/proto/**', 'examples/**']
    },
    ...baseConfig
]
