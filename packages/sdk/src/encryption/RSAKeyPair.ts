import crypto from 'crypto'
import { promisify } from 'util'

/**
 * The length of encrypted data determines the minimum length. In StreamrClient we use RSA
 * for encrypting 32 byte GroupKeys. In Node environment 585 bits is enough, but in
 * browser environment we need 640.
 * https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding
 */
export const MIN_KEY_LENGTH = 640

function getSubtle(): crypto.webcrypto.SubtleCrypto {
    const subtle = typeof window !== 'undefined' ? window?.crypto?.subtle : crypto.webcrypto.subtle
    if (!subtle) {
        const url = 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(
            `SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS) & Node 16+. ${url}`
        )
    }
    return subtle
}

function ab2str(...args: any[]): string {
    // @ts-expect-error Uint8Array parameters
    return String.fromCharCode.apply(null, new Uint8Array(...args) as unknown as number[])
}

// shim browser btoa for node
function btoa(str: string | Uint8Array): string {
    if (global.btoa) {
        return global.btoa(str as string)
    }
    let buffer

    if (Buffer.isBuffer(str)) {
        buffer = str
    } else {
        buffer = Buffer.from(str.toString(), 'binary')
    }

    return buffer.toString('base64')
}

async function exportCryptoKey(key: CryptoKey, { isPrivate = false } = {}): Promise<string> {
    const keyType = isPrivate ? 'pkcs8' : 'spki'
    const exported = await getSubtle().exportKey(keyType, key)
    const exportedAsString = ab2str(exported)
    const exportedAsBase64 = btoa(exportedAsString)
    const TYPE = isPrivate ? 'PRIVATE' : 'PUBLIC'
    return `-----BEGIN ${TYPE} KEY-----\n${exportedAsBase64}\n-----END ${TYPE} KEY-----\n`
}

export class RSAKeyPair {
    // the keys are in PEM format
    private readonly privateKey: string
    private readonly publicKey: string

    private constructor(privateKey: string, publicKey: string) {
        this.privateKey = privateKey
        this.publicKey = publicKey
    }

    getPublicKey(): string {
        return this.publicKey
    }

    getPrivateKey(): string {
        return this.privateKey
    }

    static async create(keyLength: number): Promise<RSAKeyPair> {
        return typeof window !== 'undefined'
            ? RSAKeyPair.create_browserEnvironment(keyLength)
            : RSAKeyPair.create_serverEnvironment(keyLength)
    }

    private static async create_serverEnvironment(keyLength: number): Promise<RSAKeyPair> {
        // promisify here to work around browser/server packaging
        const generateKeyPair = promisify(crypto.generateKeyPair)
        const { publicKey, privateKey } = await generateKeyPair('rsa', {
            modulusLength: keyLength,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        })

        return new RSAKeyPair(privateKey, publicKey)
    }

    private static async create_browserEnvironment(keyLength: number): Promise<RSAKeyPair> {
        const { publicKey, privateKey } = await getSubtle().generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: keyLength,
                publicExponent: new Uint8Array([1, 0, 1]), // 65537
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        )

        const [exportedPrivate, exportedPublic] = await Promise.all([
            exportCryptoKey(privateKey, {
                isPrivate: true
            }),
            exportCryptoKey(publicKey, {
                isPrivate: false
            })
        ])
        return new RSAKeyPair(exportedPrivate, exportedPublic)
    }
}
