module.exports = {
    preset: 'ts-jest',
    globals: {
        'ts-jest': {
            babelConfig: false,
            tsconfig: 'tsconfig.test.json',
        }
    },
    clearMocks: true,
    testEnvironment: 'node'
}
