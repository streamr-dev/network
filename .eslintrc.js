module.exports = {
    extends: 'eslint-config-streamr-ts',
    rules: {
        'eol-last': ['error'],
        'no-console': ['error', {allow: ['warn', 'error', 'info']}],
        'no-restricted-imports': ['error', {
            "patterns": ["*/dist"]
        }],
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/consistent-indexed-object-style': ['error'],
        '@typescript-eslint/consistent-type-assertions': ['error'],
        '@typescript-eslint/consistent-type-definitions': ['error'],
        '@typescript-eslint/member-delimiter-style': ['error', {
            'singleline': {
                'delimiter': 'comma'
            },
            'multiline': {
                'delimiter': 'none'
            }
        }],
        '@typescript-eslint/no-confusing-non-null-assertion': ['error'],
        '@typescript-eslint/no-duplicate-enum-values': ['error'],
        '@typescript-eslint/no-extraneous-class': ['error'],
        '@typescript-eslint/no-invalid-void-type': ['error']
        //'@typescript-eslint/no-empty-function': 'error',
    }
}
