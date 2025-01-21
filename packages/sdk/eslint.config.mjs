import baseConfig from '../../eslint.config.mjs'

export default [
    {
        ignores: [
            'src/ethereumArtifacts/**',
            'test/exports/**',
            'test/benchmarks/**',
            'test/memory/*',
            // TODO remove when https://github.com/streamr-dev/network/pull/2848 merged to main
            'src/utils/persistence/BrowserPersistence.ts'
        ]
    },
    ...baseConfig
]
