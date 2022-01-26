// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html
module.exports = {

    name: 'simulator',

    displayName: 'simulator',

    // Preset ts-jest
    preset: 'ts-jest',

    // Automatically clear mock calls and instances between every test
    clearMocks: true,

    // An array of glob patterns indicating a set of files for which coverage information should be collected
    collectCoverageFrom: ['src/**'],

    // The directory where Jest should output its coverage files
    coverageDirectory: 'coverage',

    // The test environment that will be used for testing
    testEnvironment: 'node',

    // Default timeout of a test in milliseconds
    testTimeout: 15000,
    maxWorkers: 3,

    // This option allows use of a custom test runner
    testRunner: 'jest-circus/runner',

    testPathIgnorePatterns: ["/browser/","/fixtures/","/benchmarks/",
        "/integration/webrtc-endpoint-back-pressure-handling.test.ts", 
        "/integration/ws-endpoint-back-pressure-handling.test.ts", 
        "/integration/UnixSocketWsServer.test.ts",
        "/integration/browser-ws-endpoint.test.ts",
        "/node_modules/"],

    setupFilesAfterEnv: ["jest-extended"],

    globals: {
        _streamr_simulator_test: true
    },

    "moduleNameMapper": {
        "ServerWsEndpoint": "<rootDir>/src/simulator/ServerWsEndpoint_simulator.ts",
        "AbstractClientWsEndpoint": "<rootDir>/src/simulator/AbstractClientWsEndpoint_simulator.ts", 
        "NodeClientWsConnection": "<rootDir>/src/simulator/NodeClientWsConnection_simulator.ts",   
        "NodeClientWsEndpoint": "<rootDir>/src/simulator/NodeClientWsEndpoint_simulator.ts",     
        "ServerWsConnection": "<rootDir>/src/simulator/ServerWsConnection_simulator.ts",
        "NodeWebRtcConnection": "<rootDir>/src/simulator/NodeWebRtcConnection_simulator.ts"
    }
}
