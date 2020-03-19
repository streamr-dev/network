module.exports = exports = {
    extends: [
        'streamr-nodejs'
    ],
    rules: {
        'max-len': ['warn', { code: 150 }],
        'no-plusplus': ['error', { 'allowForLoopAfterthoughts': true }],
        'no-underscore-dangle': ['error', { 'allowAfterThis': true }],
        'padding-line-between-statements': [
            'error',
            { 'blankLine': 'always', 'prev': 'if', 'next': 'if' }
        ],
        'prefer-destructuring': 'warn',
    }
}
