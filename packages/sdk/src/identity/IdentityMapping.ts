import { KeyType, KEY_TYPES } from '@streamr/utils'
import { SignatureType } from '@streamr/trackerless-network'
import type { KeyPairIdentityConfig, EthereumProviderIdentityConfig, StrictStreamrClientConfig, CustomIdentityConfig } from '../ConfigTypes'
import { EthereumKeyPairIdentity } from './EthereumKeyPairIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'
import { MLDSAKeyPairIdentity } from './MLDSAKeyPairIdentity'
import { ECDSAKeyPairIdentity } from './ECDSAKeyPairIdentity'

/**
 * This is where config keyTypes are connected to Identity implementations.
 * 
 * How to configure new Identity types:
 * 1. Add a new SignatureType entry to NetworkRpc.proto in network package
 * 2. Add the needed SigningUtil to SigningUtil.ts and tests to SigningUtil.test.ts
 * 3. Add the new SigningUtil to exports.ts in the utils package
 * 3. Create the Identity implementation itself (eg. extend KeyPairIdentity) and tests for it
 * 4. Wire everything together below
 */
export const IDENTITY_MAPPING: {
    keyType: KeyType
    // Used by createIdentityFromConfig
    fromConfig: (config: Pick<StrictStreamrClientConfig, 'auth'>) => Identity
    // Used by SignatureValidator
    signatureType: SignatureType
}[] = [
    { 
        keyType: 'ECDSA_SECP256K1_EVM',
        fromConfig: EthereumKeyPairIdentity.fromConfig, 
        signatureType: SignatureType.ECDSA_SECP256K1_EVM,
    },
    { 
        keyType: 'ECDSA_SECP256R1',
        fromConfig: ECDSAKeyPairIdentity.fromConfig, 
        signatureType: SignatureType.ECDSA_SECP256R1,
    },
    {
        keyType: 'ML_DSA_87',
        fromConfig: MLDSAKeyPairIdentity.fromConfig,
        signatureType: SignatureType.ML_DSA_87,
    },
] as const

export const DEFAULT_KEY_TYPE: KeyType = 'ECDSA_SECP256K1_EVM'

// Static check that all valid key types have corresponding factory functions above
KEY_TYPES.forEach((keyType) => {
    if (!IDENTITY_MAPPING.find((id) => id.keyType === keyType)) {
        throw new Error(`keyType missing from IDENTITIES: ${keyType}`)
    }
})

/**
 * Creates an Identity instance based on what's in the StreamrClient config
 */
export function createIdentityFromConfig(config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): Identity {
    // Key pair -based identities
    if ((config.auth as KeyPairIdentityConfig)?.privateKey !== undefined) {
        // Default key type is secp256k1 private key (="Ethereum private key")
        const keyType = (config.auth as KeyPairIdentityConfig).keyType ?? DEFAULT_KEY_TYPE

        const idMapping = IDENTITY_MAPPING.find((id) => id.keyType === keyType)
        if (idMapping) {
            return idMapping.fromConfig(config)
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
