import { ECDSA_SECP256K1_EVM, ECDSA_SECP256R1, ML_DSA_87, SigningUtil } from '@streamr/utils'
import { KeyPairIdentityConfig, EthereumProviderIdentityConfig, StrictStreamrClientConfig, CustomIdentityConfig } from '../Config'
import { EthereumKeyPairIdentity } from './EthereumKeyPairIdentity'
import { EthereumProviderIdentity } from './EthereumProviderIdentity'
import { Identity } from './Identity'
import { MLDSAKeyPairIdentity } from './MLDSAKeyPairIdentity'
import { SignatureType } from '@streamr/trackerless-network'
import { ECDSAKeyPairIdentity } from './ECDSAKeyPairIdentity'

/**
 * This is where config keyTypes are connected to Identity implementations.
 * 
 * How to configure new Identity types:
 * 1. Add a new SignatureType entry to NetworkRpc.proto in network package
 * 2. Add the needed SigningUtil to signingUtils.ts and tests to signingUtils.test.ts
 * 3. Create the Identity implementation itself (eg. extend KeyPairIdentity) and tests for it
 * 4. Wire everything together below
 */
export const validKeyTypeValues = ['ECDSA_SECP256K1_EVM', 'ECDSA_SECP256R1', 'ML_DSA_87'] as const
export const identityConfig: Record<KeyType, {
    fromConfig: (config: Pick<StrictStreamrClientConfig, 'auth'>) => Promise<Identity>
    generate: () => Promise<Identity>
    signingUtil: SigningUtil
    signatureType: SignatureType
}> = {
    'ECDSA_SECP256K1_EVM': { 
        fromConfig: EthereumKeyPairIdentity.fromConfig, 
        generate: EthereumKeyPairIdentity.generate,
        signingUtil: ECDSA_SECP256K1_EVM,
        signatureType: SignatureType.ECDSA_SECP256K1_EVM,
    },
    'ECDSA_SECP256R1': { 
        fromConfig: ECDSAKeyPairIdentity.fromConfig, 
        generate: ECDSAKeyPairIdentity.generate,
        signingUtil: ECDSA_SECP256R1,
        signatureType: SignatureType.ECDSA_SECP256R1,
    },
    'ML_DSA_87': {
        fromConfig: MLDSAKeyPairIdentity.fromConfig,
        generate: MLDSAKeyPairIdentity.generate, 
        signingUtil: ML_DSA_87,
        signatureType: SignatureType.ML_DSA_87,
    }
}

export type KeyType = typeof validKeyTypeValues[number]
export const DEFAULT_KEY_TYPE: KeyType = 'ECDSA_SECP256K1_EVM'

// Static check that all valid key types have corresponding factory functions above
validKeyTypeValues.forEach((keyType) => {
    if (!(keyType in identityConfig)) {
        throw new Error(`Missing factory function for keyType: ${keyType}`)
    }
})

/**
 * Creates an Identity instance based on what's in the StreamrClient config
 */
export function createIdentityFromConfig(config: Pick<StrictStreamrClientConfig, 'auth' | 'contracts'>): { 
    signatureType: SignatureType
    identityPromise: Promise<Identity>
} {
    // Key pair -based identities
    if ((config.auth as KeyPairIdentityConfig)?.privateKey !== undefined) {
        // Default key type is secp256k1 private key (="Ethereum private key")
        const keyType = (config.auth as KeyPairIdentityConfig).keyType ?? DEFAULT_KEY_TYPE

        if (identityConfig[keyType]) {
            return {
                signatureType: identityConfig[keyType].signatureType,
                identityPromise: identityConfig[keyType].fromConfig(config)
            }
        } else {
            throw new Error(`Unsupported keyType given in config: ${keyType}`)
        }
    } 
    
    // If a custom identity implementation is given, simply use that
    const identityImpl = (config.auth as CustomIdentityConfig)?.identity
    if (identityImpl !== undefined) {
        return {
            signatureType: identityImpl.getSignatureType(),
            identityPromise: Promise.resolve((config.auth as CustomIdentityConfig)?.identity)
        }
    }

    // Ethereum provider
    if ((config.auth as EthereumProviderIdentityConfig)?.ethereum !== undefined) {
        return {
            signatureType: SignatureType.ECDSA_SECP256K1_EVM,
            identityPromise: EthereumProviderIdentity.fromConfig(config),
        }
    }

    // If no identity is configured, generate a random EthereumKeyPairIdentity
    return {
        signatureType: SignatureType.ECDSA_SECP256K1_EVM,
        identityPromise: EthereumKeyPairIdentity.generate()
    }
}
