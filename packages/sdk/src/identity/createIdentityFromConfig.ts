import { Wallet } from 'ethers'
import { KeyPairIdentityConfig, EthereumProviderIdentityConfig, StrictStreamrClientConfig, CustomIdentityConfig } from '../Config'
import { EthereumKeyPairIdentity } from './EthereumKeyPairIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'
import { MLDSAKeyPairIdentity } from './MLDSAKeyPairIdentity'

export type ValidKeyTypeString = 'secp256k1' | 'ml-dsa-87'

/**
 * Creates an Identity instance based on what's in the StreamrClient config
 */
export const createIdentityFromConfig = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): Identity => {
    // Key pair -based identities
    if ((config.auth as KeyPairIdentityConfig)?.privateKey !== undefined) {
        // Default key type is secp256k1 private key (="Ethereum private key")
        const keyType = (config.auth as KeyPairIdentityConfig).keyType ?? 'secp256k1'

        if (keyType === 'secp256k1') {
            return EthereumKeyPairIdentity.fromConfig(config)
        } else if (keyType === 'ml-dsa-87') {
            return MLDSAKeyPairIdentity.fromConfig(config)
        } else {
            throw new Error(`Unsupported keyType given in config: ${keyType}`)
        }
    } 
    
    // If a custom identity implementation is given, simply use that
    if ((config.auth as CustomIdentityConfig)?.identity !== undefined) {
        return (config.auth as CustomIdentityConfig)?.identity
    }

    // Ethereum provider
    if ((config.auth as EthereumProviderIdentityConfig)?.ethereum !== undefined) {
        return EthereumProviderIdentity.fromConfig(config)
    }

    // If no identity is configured, generate a random Ethereum identity
    return new EthereumKeyPairIdentity(Wallet.createRandom().privateKey)
}
