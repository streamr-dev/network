import crypto from 'crypto'

export function getSubtle(): crypto.webcrypto.SubtleCrypto {
    const subtle = crypto.webcrypto.subtle

    if (!subtle) {
        const url =
            'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(
            `SubtleCrypto not supported. This feature is available only in Node 16+. ${url}`
        )
    }

    return subtle
}
