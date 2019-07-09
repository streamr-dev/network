const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = exports = {
    extends: [
        'streamr-nodejs'
    ],
    rules: {
        'max-len': [WARN, { code: 150 }],
        'no-plusplus': ["error", { "allowForLoopAfterthoughts": true }],
        'no-underscore-dangle': ["error", { "allowAfterThis": true }],
        "padding-line-between-statements": [
            "error",
            { "blankLine": "always", "prev": "if", "next": "if" }
        ]
    }
}
