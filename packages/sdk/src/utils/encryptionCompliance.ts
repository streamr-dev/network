import { AsymmetricEncryptionType } from '@streamr/trackerless-network'
import { EncryptionType, SignatureType, StrictStreamrClientConfig } from '../exports'
import { Identity } from '../identity/Identity'

const quantumResistantSignatureTypes = new Set<SignatureType>([SignatureType.ML_DSA_87])
const quantumResistantAsymmetricEncryptionTypes = new Set<AsymmetricEncryptionType>([AsymmetricEncryptionType.ML_KEM])
const quantumResistantEncryptionTypes = new Set<EncryptionType>([EncryptionType.AES])

export function assertCompliantIdentity(identity: Identity, config: Pick<StrictStreamrClientConfig, 'encryption'>): void {
    const isQuantumSecure = quantumResistantSignatureTypes.has(identity.getSignatureType())
    const quantumSecurityIsRequired = config.encryption.requireQuantumResistantSignatures

    if (quantumSecurityIsRequired && !isQuantumSecure) {
        throw new Error(`Quantum resistant signatures are required, but the configured key type doesn't enable quantum resistance!`)
    }
}

export function isCompliantAsymmetricEncryptionType(encryptionType: AsymmetricEncryptionType, 
    config: Pick<StrictStreamrClientConfig, 'encryption'>): boolean {
    const isQuantumSecure = quantumResistantAsymmetricEncryptionTypes.has(encryptionType)
    const quantumSecurityIsRequired = config.encryption.requireQuantumResistantKeyExchange

    return isQuantumSecure || !quantumSecurityIsRequired
}

export function isCompliantEncryptionType(encryptionType: EncryptionType, config: Pick<StrictStreamrClientConfig, 'encryption'>): boolean {
    const isQuantumSecure = quantumResistantEncryptionTypes.has(encryptionType)
    const quantumSecurityIsRequired = config.encryption.requireQuantumResistantEncryption

    return isQuantumSecure || !quantumSecurityIsRequired
}
