const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'plugin:promise/recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    env: {
        jest: true,
    },
    rules: {
        'max-len': [WARN, {
            code: 150
        }],
        radix: ['error', 'as-needed'],
        'max-classes-per-file': DISABLED,
        'promise/always-return': WARN,
        'promise/catch-or-return': WARN,
        '@typescript-eslint/no-empty-function': DISABLED,
        '@typescript-eslint/ban-ts-comment': DISABLED
    },
    'overrides': [
        {
            'files': ['*.js'],
            'rules': {
                '@typescript-eslint/no-var-requires': DISABLED
            }
        }
    ]
}
