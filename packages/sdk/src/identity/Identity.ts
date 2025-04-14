import { UserID } from '@streamr/utils'
import { AbstractSigner, BrowserProvider, Provider, Wallet } from 'ethers'
import { PrivateKeyAuthConfig, ProviderAuthConfig, StrictStreamrClientConfig } from '../Config'
import { RpcProviderSource } from '../RpcProviderSource'
import { EthereumPrivateKeyIdentity } from './EthereumPrivateKeyIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { SignatureType } from '@streamr/trackerless-network'

export const IdentityInjectionToken = Symbol('Identity')

/**
 * The {@link https://docs.ethers.org/v6/api/providers/abstract-signer/#AbstractSigner AbstractSigner} type is from the `ethers` library.
 */
export type SignerWithProvider = AbstractSigner<Provider>

export abstract class Identity {
    abstract getUserId(): Promise<UserID>
    abstract getSignatureType(): SignatureType
    abstract createMessageSignature(payload: Uint8Array): Promise<Uint8Array>
    abstract getTransactionSigner(rpcProviderSource: RpcProviderSource): Promise<SignerWithProvider>
}

export const createIdentityFromConfig = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts' | '_timeouts'>): Identity => {
    if ((config.auth as PrivateKeyAuthConfig)?.privateKey !== undefined) {
        const privateKey = (config.auth as PrivateKeyAuthConfig).privateKey
        const normalizedPrivateKey = !privateKey.startsWith('0x')
            ? `0x${privateKey}`
            : privateKey
        return new EthereumPrivateKeyIdentity(normalizedPrivateKey)
    } else if ((config.auth as ProviderAuthConfig)?.ethereum !== undefined) {
        const ethereum = (config.auth as ProviderAuthConfig)?.ethereum
        const provider = new BrowserProvider(ethereum)
        return new EthereumProviderIdentity(provider, config.contracts.ethereumNetwork.chainId)
    } else {
        return new EthereumPrivateKeyIdentity(Wallet.createRandom().privateKey)
    }
}
