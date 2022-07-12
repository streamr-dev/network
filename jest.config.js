module.exports = {
    preset: 'ts-jest/presets/js-with-ts',
    testEnvironment: 'node',
    clearMocks: true,
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.jest.json',
        }
    },
    testRunner: 'jest-circus/runner',
    setupFilesAfterEnv: ['jest-extended']
}
