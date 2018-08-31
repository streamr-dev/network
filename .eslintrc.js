const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    "extends": [
        "plugin:prettier/recommended",
        "prettier/flowtype",
        "prettier/standard"
    ],
    "env": {
        "es6": true,
        "node": true
    },
    "plugins": [
        "prettier"
    ],
    settings: {
        onlyFilesWithFlowAnnotation: true
    },
    "rules": {
        "prettier/prettier": "error"
    },
    rules: {
        'arrow-parens': [ERROR, 'always', {
            requireForBlockBody: false
        }],
        'curly': [ERROR, 'all'],
        'flowtype/define-flow-type': ERROR,
        'flowtype/newline-after-flow-annotation': [ERROR, 'always'],
        'import/extensions': [ERROR, 'always', {
            'js': 'never',
            'jsx': 'never',
            'json': 'never',
        }],
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
        'max-len': [ERROR, { code: 150 }],
        'no-console': [WARN, { allow: ['warn', 'error'] }],
        'no-debugger': WARN,
        'no-multiple-empty-lines': [ERROR, {
            max: 1,
            maxBOF: 0
        }],
        'no-self-compare': DISABLED,
        'object-curly-newline': [ERROR, {
            ObjectExpression: {
                minProperties: 1
            },
            ObjectPattern: {
                minProperties: 5
            }
        }],
        'quote-props': [ERROR, 'as-needed', {
            numbers: true
        }],
        'semi': [ERROR, 'never']
    }
};