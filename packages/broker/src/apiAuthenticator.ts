import { Config } from './config'

export interface ApiAuthenticator {
    isValidAuthentication: (apiKey?: string) => boolean
}

export const createApiAuthenticator = (config: Config): ApiAuthenticator => {
    if (config.apiAuthentication !== null) {
        return {
            isValidAuthentication: (apiKey?: string) => {
                if (apiKey === undefined) {
                    return false
                }
                return config.apiAuthentication!.keys.includes(apiKey!)
            }
        }
    } else {
        return {
            isValidAuthentication: () => true
        }
    }
}
