import baseConfig from '../../eslint.config.mjs'

export default [
    {
        ignores: [
            'src/ethereumArtifacts/**',
            'test/exports/**',
            'test/benchmarks/**',
            'test/memory/*'
        ]
    },
    ...baseConfig
]
