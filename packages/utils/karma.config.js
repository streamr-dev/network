// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createKarmaConfig, createWebpackConfig } = require('@streamr/browser-test-runner')

const TEST_PATHS = ['test/**/*.ts']

module.exports = createKarmaConfig(
    TEST_PATHS,
    createWebpackConfig({
        entry: './src/exports.ts',
        libraryName: 'utils'
    })
)
