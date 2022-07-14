module.exports = {
    extends: 'eslint-config-streamr-ts',
    rules: {
        'eol-last': ['error'],
        'no-console': ['error', {allow: ['warn', 'error', 'info']}],
        'no-restricted-imports': ['error', {
            "patterns": ["*/dist"]
        }],
        '@typescript-eslint/no-inferrable-types': 'off'
    }
}
