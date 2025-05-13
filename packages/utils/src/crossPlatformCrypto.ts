import crypto from 'crypto'

declare const self: any

export function getSubtle(): crypto.webcrypto.SubtleCrypto {
    // in browser main thread, self === window
    // in web workers, self is defined but window is not
    // in node.js, self is undefined
    const subtle = typeof self !== 'undefined' ? self?.crypto?.subtle : crypto.webcrypto.subtle
    if (!subtle) {
        const url = 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(`SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS) & Node 16+. ${url}`)
    }
    return subtle
}
