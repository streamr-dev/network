import { AsymmetricEncryptionType, EncryptionType, SignatureType } from '@streamr/trackerless-network'
import { StreamrClientConfig, StrictStreamrClientConfig } from '../Config'
import { Identity } from '../identity/Identity'
import { RSAKeyPair } from '../encryption/RSAKeyPair'
import { MLKEMKeyPair } from '../encryption/MLKEMKeyPair'
import { KeyExchangeKeyPair } from '../encryption/KeyExchangeKeyPair'

const quantumResistantSignatureTypes = new Set<SignatureType>([SignatureType.ML_DSA_87])
const quantumResistantAsymmetricEncryptionTypes = new Set<AsymmetricEncryptionType>([AsymmetricEncryptionType.ML_KEM])
const quantumResistantEncryptionTypes = new Set<EncryptionType>([EncryptionType.AES])

export function assertCompliantIdentity(identity: Identity, config: Pick<StreamrClientConfig, 'encryption'>): void {
    const isQuantumSecure = isQuantumResistantIdentity(identity)
    const quantumSecurityIsRequired = config.encryption?.requireQuantumResistantSignatures

    if (quantumSecurityIsRequired && !isQuantumSecure) {
        throw new Error(`Quantum resistant signatures are required, but the configured key type doesn't enable quantum resistance!`)
    }
}

export function isCompliantAsymmetricEncryptionType(encryptionType: AsymmetricEncryptionType, 
    config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumSecure = quantumResistantAsymmetricEncryptionTypes.has(encryptionType)
    const quantumSecurityIsRequired = config.encryption?.requireQuantumResistantKeyExchange

    return isQuantumSecure || !quantumSecurityIsRequired
}

export function isCompliantEncryptionType(encryptionType: EncryptionType, config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumSecure = quantumResistantEncryptionTypes.has(encryptionType)
    const quantumSecurityIsRequired = config.encryption?.requireQuantumResistantEncryption

    return isQuantumSecure || !quantumSecurityIsRequired
}

export function isCompliantSignatureType(signatureType: SignatureType, config: Pick<StreamrClientConfig, 'encryption'>): boolean {
    const isQuantumSecure = quantumResistantSignatureTypes.has(signatureType)
    const quantumSecurityIsRequired = config.encryption?.requireQuantumResistantEncryption

    return isQuantumSecure || !quantumSecurityIsRequired
}

export function isQuantumResistantIdentity(identity: Identity): boolean {
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
