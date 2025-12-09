import type { Config } from "@jest/types"
import defaultConfig from "../../jest.config"

export default {
    ...defaultConfig,
    moduleNameMapper: {
        "^@crypto$": "<rootDir>/src/node/crypto",
        "^@md5$": "<rootDir>/src/node/md5",
    },
    displayName: "@streamr/utils",
} satisfies Config.InitialOptions
