import baseConfig from '../../eslint.config.mjs'
import globals from 'globals'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
    ...baseConfig.map((config) => {
        return ((config.name === 'streamr-typescript') || (config.name === 'streamr-network-typescript')) ? {
            ...config,
            languageOptions: {
                ...config.languageOptions,
                globals: {
                    ...globals.browser,
                    process: 'readonly'
                },
                parserOptions: {
                    project: ['./tsconfig.node.json'],
                    tsconfigRootDir: __dirname
                }
            }
        }
        : config
    }),
    {
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            'import/no-extraneous-dependencies': ['error', {
                packageDir: ['.', '../..']
            }]
        }
    }
]
