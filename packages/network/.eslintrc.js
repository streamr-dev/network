const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'plugin:promise/recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        'arrow-parens': [ERROR, 'always'],
        'curly': [ERROR, 'all'],
        'indent': [ERROR, 4],
        'no-console': [WARN, { allow: ['warn', 'error'] }],
        'no-debugger': WARN,
        'no-multiple-empty-lines': [ERROR, {
            max: 1,
            maxBOF: 0,
        }],
        'no-underscore-dangle': ERROR,
        'require-atomic-updates': ERROR,
        'semi': [ERROR, 'never'],
        'newline-per-chained-call': DISABLED,
        'max-len': [WARN, {
            code: 150
        }],
        'max-classes-per-file': DISABLED,
        'promise/always-return': WARN,
        'import/no-unresolved': DISABLED,
        'import/extensions': DISABLED,
        'import/order': DISABLED,
        'quote-props': DISABLED,
        'object-curly-newline': DISABLED,
        'promise/no-callback-in-promise': DISABLED,
        '@typescript-eslint/no-unused-vars': [ERROR, { 'argsIgnorePattern': '^_' }],
        '@typescript-eslint/no-explicit-any': DISABLED,
        '@typescript-eslint/no-empty-function': DISABLED,
        '@typescript-eslint/no-non-null-assertion': DISABLED
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
