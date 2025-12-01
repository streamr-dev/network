import type { webcrypto } from 'crypto'

export function getSubtle(): webcrypto.SubtleCrypto {
    if (!crypto.subtle) {
        const url =
            'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(
            `SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS). ${url}`
        )
    }

    return crypto.subtle as webcrypto.SubtleCrypto
}
