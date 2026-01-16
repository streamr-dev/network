import { hexToBinary, EcdsaSecp256r1 } from '@streamr/utils'
import { KeyPairIdentity } from './KeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { StrictStreamrClientConfig } from '../ConfigTypes'
import type { webcrypto } from 'crypto'

const signingUtil = new EcdsaSecp256r1()

/**
 * An identity that uses ECDSA on the SECP256R1 curve
 */
export class ECDSAKeyPairIdentity extends KeyPairIdentity {

    private cachedJWK: webcrypto.JsonWebKey | undefined

    assertValidKeyPair(): void {
        signingUtil.assertValidKeyPair(this.publicKey, this.privateKey)
    }

    // eslint-disable-next-line class-methods-use-this
    getSignatureType(): SignatureType {
        return SignatureType.ECDSA_SECP256R1
    }

    async createMessageSignature(payload: Uint8Array): Promise<Uint8Array> {
        // Cache the privateKey in JWK format for a performance optimization
        this.cachedJWK ??= signingUtil.privateKeyToJWK(this.privateKey)
        return signingUtil.createSignature(payload, this.cachedJWK)
    }

    /** @internal */
    static fromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): ECDSAKeyPairIdentity {
        const keyPairConfig = KeyPairIdentity.getKeyPairFromConfig(config)
        const privateKey = hexToBinary(keyPairConfig.privateKey)
        const publicKey = keyPairConfig.publicKey ? hexToBinary(keyPairConfig.publicKey) : signingUtil.getPublicKeyFromPrivateKey(privateKey)
        return new ECDSAKeyPairIdentity(publicKey, privateKey)
    }

    static generate(): ECDSAKeyPairIdentity {
        const keyPair = signingUtil.generateKeyPair()
        return new ECDSAKeyPairIdentity(keyPair.publicKey, keyPair.privateKey)
    }

}
