import { createKarmaConfig, createWebpackConfig } from '@streamr/browser-test-runner'
import { resolve } from 'path'

const TEST_PATHS = ['test/**/*.ts']

export default createKarmaConfig(TEST_PATHS, createWebpackConfig({
    libraryName: 'utils',
    fallback: {
        module: false
    },
    alias: {
        '@crypto': resolve(__dirname, 'src/browser/crypto.ts'),
        os: resolve(__dirname, 'src/browser/os.ts'),
        path: 'path-browserify',
    },
}))
