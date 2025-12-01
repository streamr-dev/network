import type { Config } from "@jest/types"
import defaultConfig from "../../jest.config"

export default {
    ...defaultConfig,
    moduleNameMapper: {
        "^@crypto$": "<rootDir>/src/node/crypto",
    },
    displayName: "@streamr/utils",
} satisfies Config.InitialOptions
