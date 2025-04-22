import { toUserId, UserID, UserIDRaw } from '@streamr/utils'
import { RpcProviderSource } from '../RpcProviderSource'
import { Identity, SignerWithProvider } from './Identity'
import { KeyPairIdentityConfig, StrictStreamrClientConfig } from '../Config'

export abstract class KeyPairIdentity extends Identity {
    publicKeyString: UserID
    publicKey: UserIDRaw
    privateKey: Uint8Array

    constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
        super()
        this.publicKey = publicKey
        this.privateKey = privateKey
        this.publicKeyString = toUserId(this.publicKey)

        if (this.publicKey.length !== this.getExpectedPublicKeyLength()) {
            throw new Error(`Unexpected publicKey length! Expected ${
                this.getExpectedPublicKeyLength()
            } bytes, got ${
                this.publicKey.length
            } bytes.`)
        }

        if (this.privateKey.length !== this.getExpectedPrivateKeyLength()) {
            throw new Error(`Unexpected privateKey length! Expected ${
                this.getExpectedPrivateKeyLength()
            } bytes, got ${
                this.privateKey.length
            } bytes.`)
        }

        this.assertKeyPairIsValid()
    }

    /**
     * Should throw if the publicKey and privateKey don't match each other
     */
    abstract assertKeyPairIsValid(): void

    async getUserIdBytes(): Promise<UserIDRaw> { 
        return this.publicKey
    }

    async getUserIdString(): Promise<UserID> { 
        return this.publicKeyString
    }

    async getPrivateKey(): Promise<Uint8Array> {
        return this.privateKey
    }

    abstract getExpectedPublicKeyLength(): number
    abstract getExpectedPrivateKeyLength(): number

    // eslint-disable-next-line class-methods-use-this
    async getTransactionSigner(_rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider> {
        throw new Error('This key pair can not sign transactions!')
    }

    static getKeyPairFromConfig(config: Pick<StrictStreamrClientConfig, 'auth'>): KeyPairIdentityConfig {
        const result = (config.auth as KeyPairIdentityConfig)
        if (!result.privateKey) {
            throw new Error('A privateKey was expected in the config, but none is defined!')
        }
        return result
    }
}
