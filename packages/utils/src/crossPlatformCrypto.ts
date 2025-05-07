import crypto from 'crypto'

declare const window: any

export function getSubtle(): crypto.webcrypto.SubtleCrypto {
    const subtle = typeof window !== 'undefined' ? window?.crypto?.subtle : crypto.webcrypto.subtle
    if (!subtle) {
        const url = 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(`SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS) & Node 16+. ${url}`)
    }
    return subtle
}
