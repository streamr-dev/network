module.exports = {
    preset: 'ts-jest',
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.jest.json',
            babelConfig: false,
        }
    },
    clearMocks: true,
    testEnvironment: 'node'
}
