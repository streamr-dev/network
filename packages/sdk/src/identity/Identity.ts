import { UserID, UserIDRaw } from '@streamr/utils'
import { AbstractSigner, Provider } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'
import { SignatureType } from '@streamr/trackerless-network'

export const IdentityInjectionToken = Symbol('Identity')

/**
 * The {@link https://docs.ethers.org/v6/api/providers/abstract-signer/#AbstractSigner AbstractSigner} type is from the `ethers` library.
 */
export type SignerWithProvider = AbstractSigner<Provider>

/**
 * Identity represents a digital identity, specified by cryptographic keys,
 * and capable of signing. You can configure new Identities in IdentityMapping.ts.
 */
export abstract class Identity {
    abstract getUserId(): Promise<UserID>
    abstract getUserIdRaw(): Promise<UserIDRaw>
    abstract getSignatureType(): SignatureType
    abstract createMessageSignature(payload: Uint8Array): Promise<Uint8Array>
    abstract getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider>

    /**
     * Returns the private key if this identity supports worker-based signing.
     * Returns undefined for identities that rely on external signers (e.g. browser wallets).
     */
    // eslint-disable-next-line class-methods-use-this
    getPrivateKey(): Promise<Uint8Array> | undefined {
        return undefined
    }
}
