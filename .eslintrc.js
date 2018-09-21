const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = exports = {
    extends: [
        'eslint:recommended',
        'airbnb-base'
    ],
    env: {
        browser: false,
        jest: true
    },
    rules: {
        'arrow-body-style': DISABLED,
        'arrow-parens': [ERROR, 'always', {
            requireForBlockBody: false
        }],
        'comma-dangle': DISABLED,
        'curly': [ERROR, 'all'],
        'import/first': DISABLED,
        'import/no-named-as-default': DISABLED,
        'import/prefer-default-export': DISABLED,
        'import/order': [ERROR, 'always', {
            'groups': [
                'builtin', 'external', 'internal', 'parent', 'sibling', 'index'
            ],
            'newlines-between': 'always'
        }],
        'indent': [ERROR, 4, {
            SwitchCase: WARN,
            MemberExpression: WARN,
            ObjectExpression: WARN
        }],
        'max-len': [WARN, { code: 150 }],
        'no-console': [WARN, { allow: ['warn', 'error'] }],
        'no-debugger': WARN,
        'no-multiple-empty-lines': [ERROR, {
            max: 1,
            maxBOF: 0
        }],
        'no-plusplus': [ERROR, { 'allowForLoopAfterthoughts': true }],
        'no-self-compare': DISABLED,
        'no-underscore-dangle': [ERROR, { 'allowAfterThis': true }],
        'no-unused-vars': WARN,
        'object-curly-newline': [ERROR, {
            ObjectExpression: {
                minProperties: 1
            },
            ObjectPattern: {
                minProperties: 5
            }
        }],
        'prefer-template': DISABLED,
        'quote-props': [ERROR, 'as-needed', {
            numbers: true
        }],
        'semi': [ERROR, 'never'],
        'max-len': WARN,
        'class-methods-use-this': DISABLED,
        'no-empty-function': WARN,
    }
}