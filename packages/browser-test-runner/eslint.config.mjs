import baseConfig from '../../eslint.config.mjs'
import globals from 'globals'

export default [
    ...baseConfig.map((config) => {
        return config.name === 'streamr-typescript' || config.name === 'streamr-network-typescript'
            ? {
                  ...config,
                  languageOptions: {
                      ...config.languageOptions,
                      globals: {
                          ...globals.browser,
                          process: 'readonly'
                      },
                      parserOptions: {
                          project: ['./tsconfig.node.json']
                      }
                  }
              }
            : config
    }),
    {
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            'import/no-extraneous-dependencies': [
                'error',
                {
                    packageDir: ['.', '../..']
                }
            ]
        }
    }
]
