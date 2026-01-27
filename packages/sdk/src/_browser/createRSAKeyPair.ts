import { type CryptoKey, getSubtle } from '@streamr/utils'
import type { PemKeyPair } from '../encryption/types'

function arrayBufferToString(buffer: ArrayBuffer): string {
    return String.fromCharCode.apply(null, [...new Uint8Array(buffer)])
}

async function exportCryptoKey(
    key: CryptoKey,
    { isPrivate = false } = {}
): Promise<string> {
    const keyType = isPrivate ? 'pkcs8' : 'spki'
    const exported = await getSubtle().exportKey(keyType, key)
    const exportedAsString = arrayBufferToString(exported)
    const exportedAsBase64 = btoa(exportedAsString)
    const TYPE = isPrivate ? 'PRIVATE' : 'PUBLIC'

    return `-----BEGIN ${TYPE} KEY-----\n${exportedAsBase64}\n-----END ${TYPE} KEY-----\n`
}

export async function createRSAKeyPair(
    keyLength: number
): Promise<PemKeyPair> {
    const { publicKey, privateKey } = await getSubtle().generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: keyLength,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    )

    const [exportedPrivate, exportedPublic] = await Promise.all([
        exportCryptoKey(privateKey, {
            isPrivate: true,
        }),
        exportCryptoKey(publicKey, {
            isPrivate: false,
        }),
    ])

    return { privateKey: exportedPrivate, publicKey: exportedPublic }
}
