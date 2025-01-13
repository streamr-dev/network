import baseConfig from '../../eslint.config.mjs'

export default [
    {
        ignores: ['data-generation/final-data/*.ts']
    },
    ...baseConfig
]
