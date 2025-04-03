import { AsymmetricEncryptionType } from '@streamr/trackerless-network'

export interface KeyExchangeKeyPair {
    getPublicKey(): Uint8Array
    getPrivateKey(): Uint8Array
    getEncryptionType(): AsymmetricEncryptionType
}
