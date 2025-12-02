import {
    createKarmaConfig,
    createWebpackConfig,
} from '@streamr/browser-test-runner'
import { fileURLToPath } from 'url'
import path from 'path'

const TEST_PATHS = ['test/**/*.ts']

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const karmaConfig = createKarmaConfig(
    TEST_PATHS,
    createWebpackConfig({
        entry: './src/exports.ts',
        libraryName: 'utils',
        fallback: {
            module: false,
        },
        alias: {
            '@crypto': path.resolve(__dirname, 'src/browser/crypto.ts'),
            os: path.resolve(__dirname, 'src/browser/os.ts'),
            path: 'path-browserify',
        },
    })
)

export default karmaConfig
