import tsParser from '@typescript-eslint/parser'
import streamr from 'eslint-config-streamr-ts'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename);

export default [
    {
        ignores: [
            '**/generated/**',
            '**/dist/**',
            '**/node_modules/**'
        ]
    },
    ...streamr,
    importPlugin.flatConfigs.recommended,
    {
        name: 'streamr-network-typescript',
        languageOptions: {
            globals: globals.node,
            parser: tsParser,
            parserOptions: {
                project: ['./tsconfig.jest.json'],
                tsconfigRootDir: __dirname
            }
        },
        rules: {
            'eol-last': 'error',
            'quotes': ['error', 'single', {
                allowTemplateLiterals: true
            }],
            'no-console': ['error', {
                allow: ['warn', 'error', 'info']
            }],
            'no-restricted-imports': ['error', {
                patterns: ['*/dist']
            }],
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/consistent-indexed-object-style': 'error',
            '@typescript-eslint/consistent-type-assertions': 'error',
            '@typescript-eslint/consistent-type-definitions': 'error',
            '@stylistic/member-delimiter-style': ['error', {
                singleline: { delimiter: 'comma' },
                multiline: { delimiter: 'none' }
            }],
            '@typescript-eslint/no-confusing-non-null-assertion': 'error',
            '@typescript-eslint/no-duplicate-enum-values': 'error',
            '@typescript-eslint/no-extraneous-class': 'error',
            '@typescript-eslint/no-invalid-void-type': 'error',
            '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            '@typescript-eslint/no-useless-empty-export': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-function-type': 'error',
            '@typescript-eslint/prefer-literal-enum-member': 'error',
            '@stylistic/comma-spacing': 'error',
            '@stylistic/brace-style': ['error', '1tbs', {
                allowSingleLine: true
            }],
            '@typescript-eslint/default-param-last': 'error',
            '@stylistic/func-call-spacing': 'error',
            '@stylistic/keyword-spacing': 'error',
            '@typescript-eslint/no-invalid-this': 'error',
            '@typescript-eslint/no-unused-expressions': 'error',
            '@typescript-eslint/no-useless-constructor': 'error',
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@typescript-eslint/parameter-properties': 'error',
            '@stylistic/space-before-blocks': 'error',
            '@stylistic/space-before-function-paren': ['error', {
                anonymous: 'never',
                named: 'never',
                asyncArrow: 'always'
            }],
            '@stylistic/space-infix-ops': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {
                vars: 'all',
                args: 'all',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],
            'class-methods-use-this': 'error',
            'prefer-arrow-callback': 'error',
            'promise/no-promise-in-callback': 'error',
            // '@typescript-eslint/no-empty-function': 'error',
            'no-multi-spaces': ['error', {
                ignoreEOLComments: true
            }],
            'default-case': 'error',
            'no-useless-return': 'error',
            'promise/always-return': ['error', {
                ignoreLastCallback: true
            }],
            'no-unneeded-ternary': 'error',
            'no-lonely-if': 'error',
            '@typescript-eslint/restrict-template-expressions': ['error', {
                allowAny: false,
                allowBoolean: true,
                allowNullish: true,
                allowNumber: true,
                allowRegExp: true,
                allowNever: true,
                allow: [{ from: 'lib', name: 'Error' }]
            }],
            '@typescript-eslint/no-misused-promises': ['error', {
                checksVoidReturn: false
            }],
            '@typescript-eslint/await-thenable': 'error',
            // TODO in follow up PRs, select which rules we should enable and fix the code. When all recommended rules
            // have been enabled, consider enabling the 'strict' preset.
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/restrict-plus-operands': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-base-to-string': 'off',
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            // TODO configure this (may need eslint-import-resolver-typescript dependency)
            'import/no-unresolved': 'off',
            // TODO enable this?
            'import/named': 'off',
            'import/no-extraneous-dependencies': ['error', {
                devDependencies: [ 'test/**/*.ts', 'test/**/*.js'],
                packageDir: ['.', '../..']
            }],
        }
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs'
        }
    }
]