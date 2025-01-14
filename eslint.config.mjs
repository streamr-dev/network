import tsParser from '@typescript-eslint/parser'
import streamr from 'eslint-config-streamr-ts'
import importPlugin from 'eslint-plugin-import'
import jestPlugin from 'eslint-plugin-jest'
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
    {
        ignores: ['**/generated/**', '**/dist/**', '**/node_modules/**']
    },
    ...streamr,
    importPlugin.flatConfigs.recommended,
    importPlugin.flatConfigs.typescript,
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
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: ['packages/*/tsconfig.jest.json', 'packages/browser-test-runner/tsconfig.node.json']
                },
                node: true
            }
        },
        rules: {
            indent: 'off',
            'class-methods-use-this': 'error',
            'default-case': 'error',
            'eol-last': 'error',
            'no-console': [
                'error',
                {
                    allow: ['warn', 'error', 'info']
                }
            ],
            'no-lonely-if': 'error',
            'no-multi-spaces': [
                'error',
                {
                    ignoreEOLComments: true
                }
            ],
            'no-restricted-imports': [
                'error',
                {
                    patterns: ['*/dist']
                }
            ],
            'no-unneeded-ternary': 'error',
            'no-useless-return': 'error',
            'prefer-arrow-callback': 'error',
            quotes: [
                'error',
                'single',
                {
                    allowTemplateLiterals: true,
                    avoidEscape: true
                }
            ],
            '@typescript-eslint/default-param-last': 'error',
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                {
                    ignoreArrowShorthand: true
                }
            ],
            '@typescript-eslint/no-extraneous-class': 'error',
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/no-invalid-this': 'error',
            '@typescript-eslint/no-invalid-void-type': 'error',
            '@typescript-eslint/no-misused-promises': [
                'error',
                {
                    checksVoidReturn: false
                }
            ],
            '@typescript-eslint/no-unused-expressions': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    vars: 'all',
                    args: 'all',
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ],
            '@typescript-eslint/no-useless-constructor': 'error',
            '@typescript-eslint/no-useless-empty-export': 'error',
            '@typescript-eslint/parameter-properties': 'error',
            '@typescript-eslint/prefer-literal-enum-member': 'error',
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                {
                    allowAny: false,
                    allowBoolean: true,
                    allowNullish: true,
                    allowNumber: true,
                    allowRegExp: true,
                    allowNever: true,
                    allow: [{ from: 'lib', name: 'Error' }]
                }
            ],
            '@stylistic/brace-style': 'off',
            '@stylistic/comma-spacing': 'error',
            '@stylistic/func-call-spacing': 'error',
            '@stylistic/keyword-spacing': 'error',
            '@stylistic/member-delimiter-style': [
                'error',
                {
                    singleline: { delimiter: 'semi' },
                    multiline: { delimiter: 'none' }
                }
            ],
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/space-before-blocks': 'error',
            '@stylistic/space-before-function-paren': [
                'error',
                {
                    anonymous: 'never',
                    named: 'never',
                    asyncArrow: 'always'
                }
            ],
            '@stylistic/space-infix-ops': 'error',
            'import/no-extraneous-dependencies': [
                'error',
                {
                    devDependencies: ['test/**/*.ts', 'test/**/*.js'],
                    packageDir: ['.', '../..']
                }
            ],
            'promise/always-return': [
                'error',
                {
                    ignoreLastCallback: true
                }
            ],
            'promise/no-promise-in-callback': 'error',

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
            '@typescript-eslint/no-redundant-type-constituents': 'off'
        }
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs'
        }
    },
    {
        files: ['**/*.test.ts'],
        ...jestPlugin.configs['flat/recommended'],
        rules: {
            ...jestPlugin.configs['flat/recommended'].rules,
            // TODO could enable some of these later:
            'jest/expect-expect': 'off',
            'jest/no-commented-out-tests': 'off',
            'jest/no-conditional-expect': 'off',
            'jest/no-disabled-tests': 'off',
            'jest/no-done-callback': 'off',
            'jest/no-jasmine-globals': 'off',
            'jest/no-standalone-expect': 'off',
            'jest/valid-title': 'off'
        }
    }
]
