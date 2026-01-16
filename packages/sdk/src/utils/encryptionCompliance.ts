import { AsymmetricEncryptionType, EncryptionType, SignatureType } from '@streamr/trackerless-network'
import type { StreamrClientConfig, StrictStreamrClientConfig } from '../ConfigTypes'
import { Identity } from '../identity/Identity'
import { RSAKeyPair } from '../encryption/RSAKeyPair'
import { MLKEMKeyPair } from '../encryption/MLKEMKeyPair'
import { KeyExchangeKeyPair } from '../encryption/KeyExchangeKeyPair'
import { StreamrClientError } from '../StreamrClientError'

const quantumResistantSignatureTypes = new Set<SignatureType>([SignatureType.ML_DSA_87])
const quantumResistantAsymmetricEncryptionTypes = new Set<AsymmetricEncryptionType>([AsymmetricEncryptionType.ML_KEM])
const quantumResistantEncryptionTypes = new Set<EncryptionType>([EncryptionType.AES])

export function assertCompliantIdentity(identity: Identity, config: Pick<StreamrClientConfig, 'encryption'>): void {
    const isQuantumResistant = isQuantumResistantIdentity(identity)
    const quantumResistanceIsRequired = config.encryption?.requireQuantumResistantSignatures

    if (quantumResistanceIsRequired && !isQuantumResistant) {
        throw new StreamrClientError(
            `Quantum resistant signatures are required, but the configured key type doesn't enable quantum resistance!`,
            'SIGNATURE_POLICY_VIOLATION'
        )
    }
}

export function isCompliantAsymmetricEncryptionType(encryptionType: AsymmetricEncryptionType, 
    config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumResistant = quantumResistantAsymmetricEncryptionTypes.has(encryptionType)
    const quantumResistanceIsRequired = config.encryption?.requireQuantumResistantKeyExchange

    return isQuantumResistant || !quantumResistanceIsRequired
}

export function isCompliantEncryptionType(encryptionType: EncryptionType, config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumResistant = quantumResistantEncryptionTypes.has(encryptionType)
    const quantumResistanceIsRequired = config.encryption?.requireQuantumResistantEncryption

    return isQuantumResistant || !quantumResistanceIsRequired
}

export function isCompliantSignatureType(signatureType: SignatureType, config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumResistant = quantumResistantSignatureTypes.has(signatureType)
    const quantumResistanceIsRequired = config.encryption?.requireQuantumResistantSignatures

    return isQuantumResistant || !quantumResistanceIsRequired
}

function isQuantumResistantIdentity(identity: Identity): boolean {
    return quantumResistantSignatureTypes.has(identity.getSignatureType())
}

/**
 * Creates a suitable key pair for key exchange based in configured Identity and config. 
 * Uses ML-KEM if required by config, OR if the identity keys imply quantum secure signatures.
 */
export async function createCompliantExchangeKeys(identity: Identity, 
    config: Pick<StrictStreamrClientConfig, 'encryption'>): Promise<KeyExchangeKeyPair> {
    if (config.encryption.requireQuantumResistantKeyExchange || isQuantumResistantIdentity(identity)) {
        return MLKEMKeyPair.create()
    } else {
        return RSAKeyPair.create(config.encryption.rsaKeyLength)
    }
}
