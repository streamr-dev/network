const DISABLED = 0
const WARN = 1
const ERROR = 2

module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        'max-len': ['error', {
            code: 150,
            ignoreTemplateLiterals: true,
            ignoreStrings: true
        }],
        'no-plusplus': ['error', {
            allowForLoopAfterthoughts: true
        }],
        'no-underscore-dangle': ['error', {
            allowAfterThis: true
        }],
        'no-trailing-spaces': ['warn'],
        // TODO remove some of these later?
        '@typescript-eslint/ban-ts-comment': DISABLED,
        '@typescript-eslint/no-empty-function': DISABLED,
        '@typescript-eslint/no-explicit-any': DISABLED,
        '@typescript-eslint/no-non-null-assertion': DISABLED,
        '@typescript-eslint/no-unused-vars': DISABLED,
        '@typescript-eslint/explicit-module-boundary-types': DISABLED,
        '@typescript-eslint/no-inferrable-types': DISABLED
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.ts'],
                moduleDirectory: ['node_modules', 'src/', 'test/'],
            }
        }
    }
}
