module.exports = exports = {
    extends: 'streamr',
    env: {
        jest: true,
    },
    rules: {
        'no-plusplus': ["error", { "allowForLoopAfterthoughts": true }],
        'no-underscore-dangle': ["error", { "allowAfterThis": true }]
    }
}
