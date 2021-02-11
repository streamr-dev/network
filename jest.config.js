module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    testEnvironment: 'node',
    // A path to a module which exports an async function that is triggered once before all test suites
    globalSetup: './jest.setup.js',
    // Allows you to use a custom runner instead of Jest's default test runner
    // testRunner: 'jest-circus/runner',
}
