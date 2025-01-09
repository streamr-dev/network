import type { Config } from '@jest/types'

const config = {
    preset: 'ts-jest',
    transform: {
        '^.+.ts$': ['ts-jest', {}],
    },
    testEnvironment: 'node',
    clearMocks: true,
    setupFilesAfterEnv: ['jest-extended/all'],
} as const satisfies Config.InitialOptions

export default config
