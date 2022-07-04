module.exports = {
    preset: 'ts-jest',
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
