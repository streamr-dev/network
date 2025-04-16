import { UserID, UserIDRaw } from '@streamr/utils'
import { AbstractSigner, Provider } from 'ethers'
import { RpcProviderSource } from '../RpcProviderSource'
import { SignatureType } from '@streamr/trackerless-network'
import { ValidKeyTypeConfig } from './createIdentityFromConfig'

export const IdentityInjectionToken = Symbol('Identity')

/**
 * The {@link https://docs.ethers.org/v6/api/providers/abstract-signer/#AbstractSigner AbstractSigner} type is from the `ethers` library.
 */
export type SignerWithProvider = AbstractSigner<Provider>

export abstract class Identity {
    abstract getUserIdString(): Promise<UserID>
    abstract getUserIdBytes(): Promise<UserIDRaw>
    abstract getSignatureType(): SignatureType
    abstract getSignatureTypeAsString(): ValidKeyTypeConfig
    abstract createMessageSignature(payload: Uint8Array): Promise<Uint8Array>
    abstract getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider>
}
