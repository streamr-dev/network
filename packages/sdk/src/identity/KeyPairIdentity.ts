import { toUserId, UserID, UserIDRaw } from '@streamr/utils'
import { RpcProviderSource } from '../RpcProviderSource'
import { Identity, SignerWithProvider } from './Identity'
import type { KeyPairIdentityConfig, StrictStreamrClientConfig } from '../ConfigTypes'

/**
 * KeyPairIdentity is an Identity that is defined by a public key and a private key.
 * It uses the public key as the UserID.
 */
export abstract class KeyPairIdentity extends Identity {
    protected readonly publicKeyString: UserID
    protected readonly publicKey: UserIDRaw
    protected readonly privateKey: Uint8Array

    constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
        super()
        this.publicKey = publicKey
        this.privateKey = privateKey
        this.publicKeyString = toUserId(this.publicKey)
        this.assertValidKeyPair()
    }

    abstract assertValidKeyPair(): void

    async getUserIdRaw(): Promise<UserIDRaw> { 
        return this.publicKey
    }

    async getUserId(): Promise<UserID> { 
        return this.publicKeyString
    }

    async getPrivateKey(): Promise<Uint8Array> {
        return this.privateKey
    }

    // eslint-disable-next-line class-methods-use-this
    async getTransactionSigner(_rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        throw new Error('This key pair can not sign transactions!')
    }

    /** @internal */
    static getKeyPairFromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): KeyPairIdentityConfig {
        const result = (config.auth as KeyPairIdentityConfig)
        if (!result.privateKey) {
            throw new Error('A privateKey was expected in the config, but none is defined!')
        }
        return result
    }
}
