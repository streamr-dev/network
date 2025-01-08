import type { Config } from '@jest/types'

const config = {
    transform: {
        '^.+.ts$': ['ts-jest', {}],
    },
    testEnvironment: 'node',
    clearMocks: true,
    setupFilesAfterEnv: ['jest-extended/all'],
} as const satisfies Config.InitialOptions

export default config
