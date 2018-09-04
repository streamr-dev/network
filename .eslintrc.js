const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    extends: ['eslint:recommended', 'prettier'], // extending recommended config and config derived from eslint-config-prettier
    plugins: ['prettier', 'import-order'], // activating esling-plugin-prettier (--fix stuff)
    rules: {
        'prettier/prettier': [ // customizing prettier rules (unfortunately not many of them are customizable)
            'error',
            {
                singleQuote: true,
                trailingComma: 'none',
                tabWidth: 4,
                semi: false
            },
        ],
        'curly': [ERROR, 'all'],
        'quote-props': [ERROR, 'as-needed', {
            numbers: true
        }],
        'no-console': [WARN, {
            allow: ['warn', 'error']
        }],
        'no-debugger': WARN,
        'no-multiple-empty-lines': [ERROR, {
            max: 1,
            maxBOF: 0
        }]
    }
};
