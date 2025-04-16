import { Wallet } from 'ethers'
import { KeyPairIdentityConfig, EthereumProviderIdentityConfig, StrictStreamrClientConfig, CustomIdentityConfig } from '../Config'
import { EthereumKeyPairIdentity } from './EthereumKeyPairIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'
import { MLDSAKeyPairIdentity } from './MLDSAKeyPairIdentity'

export const validKeyTypeValues = ['secp256k1', 'ml-dsa-87'] as const
export type ValidKeyTypeConfig = typeof validKeyTypeValues[number]

const factoryByKeyType: Record<ValidKeyTypeConfig, (config: Pick<StrictStreamrClientConfig, 'auth'>) => Identity> = {
    'secp256k1': EthereumKeyPairIdentity.fromConfig,
    'ml-dsa-87': MLDSAKeyPairIdentity.fromConfig,
}

// Static check that all valid key types have corresponding factory functions above
validKeyTypeValues.forEach((keyType) => {
    if (!(keyType in factoryByKeyType)) {
        throw new Error(`Missing factory function for keyType: ${keyType}`)
    }
})

/**
 * Creates an Identity instance based on what's in the StreamrClient config
 */
export const createIdentityFromConfig = (config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): Identity => {
    // Key pair -based identities
    if ((config.auth as KeyPairIdentityConfig)?.privateKey !== undefined) {
        // Default key type is secp256k1 private key (="Ethereum private key")
        const keyType = (config.auth as KeyPairIdentityConfig).keyType ?? 'secp256k1'

        if (factoryByKeyType[keyType]) {
            return factoryByKeyType[keyType](config)
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
