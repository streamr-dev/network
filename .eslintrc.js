module.exports = exports = {
    extends: 'streamr',
    env: {
        mocha: true,
    },
    rules: {
        'no-plusplus': ["error", { "allowForLoopAfterthoughts": true }],
        'no-underscore-dangle': ["error", { "allowAfterThis": true }]
    }
}
