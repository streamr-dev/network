module.exports = {
    extends: 'eslint-config-streamr-ts',
    rules: {
        'no-console': ['error', {allow: ['warn', 'error', 'info']}]
    }
}
