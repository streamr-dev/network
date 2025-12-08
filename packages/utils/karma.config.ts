import { createKarmaConfig, createWebpackConfig } from '@streamr/browser-test-runner'

const TEST_PATHS = ['test/**/*.ts']

export default createKarmaConfig(TEST_PATHS, createWebpackConfig({
    libraryName: 'utils',
    fallback: {
        module: false
    }
}))
