// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
    preset: 'ts-jest/presets/js-with-ts',
    clearMocks: true,
    globalTeardown: './jest.teardown.js',
    testRunner: 'jest-circus/runner',
    testEnvironment: 'node',
    testTimeout: 10000,
    setupFilesAfterEnv: ["jest-extended"]
}
