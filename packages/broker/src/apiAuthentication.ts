export interface ApiAuthentication {
    keys: string[]
}

export const isValidAuthentication = (apiKey?: string, apiAuthentication?: ApiAuthentication): boolean => {
    if (apiAuthentication !== undefined) {
        if (apiKey === undefined) {
            return false
        }
        return apiAuthentication.keys.includes(apiKey!)
    } else {
        return true
    }
}
