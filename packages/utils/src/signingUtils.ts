/* eslint-disable @typescript-eslint/no-extraneous-class */
import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa'
import { areEqualBinaries } from './binaryUtils'
import { UserIDRaw } from './UserID'
import { randomBytes } from '@noble/post-quantum/utils'

const ECDSA_SECP256K1_EVM_SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
const keccak = new Keccak(256)

export interface KeyPair {
    publicKey: Uint8Array
    privateKey: Uint8Array
}

export interface SigningUtil {
    createSignature: (payload: Uint8Array, privateKey: Uint8Array) => Uint8Array
    verifySignature: (publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array) => boolean
    [key: string]: any // Allow additional properties
}

/**
 * EVM compatible signing scheme using keccak hash, magic bytes, and secp256k1 curve.
 */
export const ECDSA_SECP256K1_EVM: SigningUtil = {
    keccakHash(message: Uint8Array, useEthereumMagic: boolean = true): Buffer {
        keccak.reset()
        keccak.update(useEthereumMagic ? Buffer.concat([
            Buffer.from(ECDSA_SECP256K1_EVM_SIGN_MAGIC + message.length), 
            message
        ]) : Buffer.from(message))
        return keccak.digest('binary')
    },

    recoverPublicKey(signature: Uint8Array, payload: Uint8Array): Uint8Array {
        const signatureBuffer = Buffer.from(signature)
        const recoveryId = signatureBuffer.readUInt8(signatureBuffer.length - 1) - 27
        return secp256k1.ecdsaRecover(
            signatureBuffer.subarray(0, signatureBuffer.length - 1),
            recoveryId,
            ECDSA_SECP256K1_EVM.keccakHash(payload),
            false,
            Buffer.alloc,
        )
    },

    createSignature(payload: Uint8Array, privateKey: Uint8Array): Uint8Array {
        const msgHash = ECDSA_SECP256K1_EVM.keccakHash(payload)
        const sigObj = secp256k1.ecdsaSign(msgHash, privateKey)
        const result = Buffer.alloc(sigObj.signature.length + 1, Buffer.from(sigObj.signature))
        result.writeInt8(27 + sigObj.recid, result.length - 1)
        return result
    },

    recoverSignerUserId(signature: Uint8Array, payload: Uint8Array): UserIDRaw {
        const publicKey = ECDSA_SECP256K1_EVM.recoverPublicKey(signature, payload)
        const pubKeyWithoutFirstByte = publicKey.subarray(1, publicKey.length)
        keccak.reset()
        keccak.update(Buffer.from(pubKeyWithoutFirstByte))
        const hashOfPubKey = keccak.digest('binary')
        return hashOfPubKey.subarray(12, hashOfPubKey.length)
    },

    verifySignature(expectedUserId: UserIDRaw, payload: Uint8Array, signature: Uint8Array): boolean {
        try {
            const recoveredAddress = ECDSA_SECP256K1_EVM.recoverSignerUserId(signature, payload)
            return areEqualBinaries(recoveredAddress, expectedUserId)
        } catch {
            return false
        }
    }
} as const

/**
 * Signing scheme using ML-DSA-87
 */
export const ML_DSA_87: SigningUtil = {
    generateKeyPair(): KeyPair {
        const seed = randomBytes(32)
        const keys = ml_dsa87.keygen(seed)
        return {
            privateKey: keys.secretKey,
            publicKey: keys.publicKey,
        }
    },

    createSignature(payload: Uint8Array, privateKey: Uint8Array, seed?: Uint8Array): Uint8Array {
        return ml_dsa87.sign(privateKey, payload, seed)
    },

    verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): boolean {
        return ml_dsa87.verify(publicKey, payload, signature)
    }
} as const
