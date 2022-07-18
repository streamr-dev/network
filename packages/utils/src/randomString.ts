export const DEFAULT_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

// From: https://stackoverflow.com/questions/10726909/random-alpha-numeric-string-in-javascript
export function randomString(length: number, charset = DEFAULT_CHARSET): string {
    let result = ''
    for (let i = 0; i < length; ++i) {
        result += charset[Math.floor(Math.random() * charset.length)]
    }
    return result
}
