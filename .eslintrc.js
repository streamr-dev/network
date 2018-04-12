module.exports = exports = {
    extends: 'streamr',
    rules: {
        // Transpiling for node would add a lot of complexity, se let's accept having to write CommonJS modules

        'no-plusplus': ["error", { "allowForLoopAfterthoughts": true }],
        'no-underscore-dangle': ["error", { "allowAfterThis": true }]
    }
}
