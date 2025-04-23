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
 * and capable of signing.
 * 
 * Quick guide for adding new Identity types:
 * - Add a new SignatureType to NetworkRpc.proto in network package
 * - Add the needed utility methods to signingUtils.ts
 * - Create the Identity implementation itself (extend KeyPairIdentity if relevant)
 * - Update createIdentityFromConfig.ts to make the new Identity configurable
 * - Update Message.ts to make it build
 */
export abstract class Identity {
    abstract getUserIdString(): Promise<UserID>
    abstract getUserIdBytes(): Promise<UserIDRaw>
    abstract getSignatureType(): SignatureType
    abstract createMessageSignature(payload: Uint8Array): Promise<Uint8Array>
    abstract getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider>
}
