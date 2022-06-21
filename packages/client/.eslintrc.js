module.exports = {
    plugins: [
        'import'
    ],
    extends: [
        'eslint-config-monorepo'
    ],
    parserOptions: {
        ecmaVersion: 2020,
        ecmaFeatures: {
            modules: true
        }
    },
    env: {
        browser: true,
        es6: true
    },
    rules: {
        'max-len': ['warn', {
            code: 150
        }],
        'no-plusplus': ['error', {
            allowForLoopAfterthoughts: true
        }],
        'no-underscore-dangle': ['error', {
            allowAfterThis: true
        }],
        'padding-line-between-statements': [
            'error',
            {
                blankLine: 'always', prev: 'if', next: 'if'
            }
        ],
        'object-curly-newline': 'off',
        'no-continue': 'off',
        'max-classes-per-file': 'off', // javascript is not java
        // TODO check all errors/warnings and create separate PR
        'promise/always-return': 'warn',
        'promise/catch-or-return': 'warn',
        'require-atomic-updates': 'warn',
        'promise/param-names': 'warn',
        'no-restricted-syntax': [
            'error', 'ForInStatement', 'LabeledStatement', 'WithStatement'
        ],
        'import/extensions': ['error', 'never', { json: 'always' }],
        'lines-between-class-members': 'off',
        'padded-blocks': 'off',
        'no-use-before-define': 'off',
        'import/order': 'off',
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
        }],
        'import/no-extraneous-dependencies': ['error', { devDependencies: ['**/*.test.*', 'test/*.ts', 'test/*.js', 'test/**/*.ts', 'test/**/*.js'] }],
        'no-redeclare': 'off',
        '@typescript-eslint/no-redeclare': ['error'],
        'no-dupe-class-members': 'off',
        '@typescript-eslint/no-dupe-class-members': ['error'],
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-useless-constructor': ['error'],
        'no-empty-function': 'off',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
        'no-console': 'off'
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.ts']
            }
        }
    }
}
