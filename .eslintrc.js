const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    extends: [
        'streamr-nodejs',
        'plugin:promise/recommended'
    ],
    rules: {
        'max-len': [WARN, {
            code: 150
        }],
        'max-classes-per-file': DISABLED,
        'promise/always-return': WARN
    }
}
