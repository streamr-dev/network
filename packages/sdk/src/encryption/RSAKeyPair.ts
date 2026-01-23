import { KeyExchangeKeyPair } from './KeyExchangeKeyPair'
import { AsymmetricEncryptionType } from '@streamr/trackerless-network'
import { utf8ToBinary } from '@streamr/utils'
import { createRSAKeyPair } from '@/createRSAKeyPair'

/**
 * The length of encrypted data determines the minimum length. In StreamrClient we use RSA
 * for encrypting 32 byte GroupKeys. In Node environment 585 bits is enough, but in
 * browser environment we need 640.
 * https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding
 */
export const MIN_KEY_LENGTH = 640

export class RSAKeyPair implements KeyExchangeKeyPair {
    // the keys are in PEM format
    private readonly privateKey: string
    private readonly publicKey: string

    private constructor(privateKey: string, publicKey: string) {
        this.privateKey = privateKey
        this.publicKey = publicKey
    }

    getPublicKey(): Uint8Array {
        // Note: the public key is passed around as an utf-8 encoded string for some legacy reasons
        return utf8ToBinary(this.publicKey)
    }

    getPrivateKey(): Uint8Array {
        // Note: the public key is passed around as an utf-8 encoded string for some legacy reasons
        return utf8ToBinary(this.privateKey)
    }

    // eslint-disable-next-line class-methods-use-this
    getEncryptionType(): AsymmetricEncryptionType {
        return AsymmetricEncryptionType.RSA
    }

    static async create(keyLength: number): Promise<RSAKeyPair> {
        const { privateKey, publicKey } = await createRSAKeyPair(keyLength)
        return new RSAKeyPair(privateKey, publicKey)
    }
}
