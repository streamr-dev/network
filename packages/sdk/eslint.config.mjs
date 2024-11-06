import baseConfig from '../../eslint.config.mjs'

export default [
    {
        ignores: [
            'src/ethereumArtifacts/**',
            'vendor/**',
            'test/exports/**',
            'test/benchmarks/**',
            'test/memory/*'
        ]
    },
    ...baseConfig
]
