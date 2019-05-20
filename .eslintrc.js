module.exports = exports = {
    extends: 'streamr-nodejs',
    env: {
        jest: true,
    },
    rules: {
        'radix': ['error', 'as-needed']
    }
}
