import { EVM_SECP256K1, ML_DSA_87, SignatureScheme } from '@streamr/utils'
import { KeyPairIdentityConfig, EthereumProviderIdentityConfig, StrictStreamrClientConfig, CustomIdentityConfig } from '../Config'
import { EthereumKeyPairIdentity } from './EthereumKeyPairIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'
import { MLDSAKeyPairIdentity } from './MLDSAKeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'

/**
 * This is where config keyTypes are connected to Identity implementations.
 * 
 * How to configure new Identity types:
 * 1. Add a new SignatureType entry to NetworkRpc.proto in network package
 * 2. Add the needed SignatureScheme to signingUtils.ts
 * 3. Create the Identity implementation itself (eg. extend KeyPairIdentity)
 * 4. Wire everything together below
 */
export const validKeyTypeValues = ['evm_secp256k1', 'ml-dsa-87'] as const
export const identityConfig: Record<KeyType, {
    fromConfig: (config: Pick<StrictStreamrClientConfig, 'auth'>) => Identity
    generate: () => Identity
    signatureScheme: SignatureScheme
    signatureType: SignatureType
}> = {
    'evm_secp256k1': { 
        fromConfig: EthereumKeyPairIdentity.fromConfig, 
        generate: EthereumKeyPairIdentity.generate,
        signatureScheme: EVM_SECP256K1,
        signatureType: SignatureType.EVM_SECP256K1,
    },
    'ml-dsa-87': {
        fromConfig: MLDSAKeyPairIdentity.fromConfig,
        generate: MLDSAKeyPairIdentity.generate, 
        signatureScheme: ML_DSA_87,
        signatureType: SignatureType.ML_DSA_87,
    }
}

export type KeyType = typeof validKeyTypeValues[number]
export const DEFAULT_KEY_TYPE: KeyType = 'evm_secp256k1'

// Static check that all valid key types have corresponding factory functions above
validKeyTypeValues.forEach((keyType) => {
    if (!(keyType in identityConfig)) {
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
        const keyType = (config.auth as KeyPairIdentityConfig).keyType ?? DEFAULT_KEY_TYPE

        if (identityConfig[keyType]) {
            return identityConfig[keyType].fromConfig(config)
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

    // If no identity is configured, generate a random EthereumKeyPairIdentity
    return EthereumKeyPairIdentity.generate()
}
