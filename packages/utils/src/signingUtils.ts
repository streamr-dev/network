/* eslint-disable @typescript-eslint/no-extraneous-class */
import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa'
import { areEqualBinaries, hexToBinary } from './binaryUtils'
import { UserIDRaw } from './UserID'
import { randomBytes } from '@noble/post-quantum/utils'
import { getSubtle } from './crossPlatformCrypto'

const SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
const keccak = new Keccak(256)

const subtleCrypto = getSubtle()

export interface KeyPair {
    publicKey: Uint8Array
    privateKey: Uint8Array
}

export interface SigningUtil {
    generateKeyPair: () => Promise<KeyPair>
    createSignature: (payload: Uint8Array, privateKey: Uint8Array) => Promise<Uint8Array>
    verifySignature: (publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array) => Promise<boolean>
    [key: string]: any // Allow additional properties
}

/**
 * EVM compatible ECDSA signing scheme using keccak hash, magic bytes, and secp256k1 curve.
 */
export const ECDSA_SECP256K1_EVM: SigningUtil = {

    async generateKeyPair(): Promise<KeyPair> {
        const privateKey = randomBytes(32)
        const publicKey = secp256k1.publicKeyCreate(privateKey, false)
        return { 
            // Return address as 'publicKey'
            publicKey: ECDSA_SECP256K1_EVM.publicKeyToAddress(publicKey),
            privateKey, 
        }
    },

    keccakHash(message: Uint8Array, useEthereumMagic: boolean = true): Buffer {
        keccak.reset()
        keccak.update(useEthereumMagic ? Buffer.concat([Buffer.from(SIGN_MAGIC + message.length), message]) : Buffer.from(message))
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

    async createSignature(payload: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
        const msgHash = ECDSA_SECP256K1_EVM.keccakHash(payload)
        const sigObj = secp256k1.ecdsaSign(msgHash, privateKey)
        const result = Buffer.alloc(sigObj.signature.length + 1, Buffer.from(sigObj.signature))
        result.writeInt8(27 + sigObj.recid, result.length - 1)
        return result
    },

    publicKeyToAddress(publicKey: Uint8Array): Uint8Array {
        const pubKeyWithoutFirstByte = publicKey.subarray(1, publicKey.length)
        keccak.reset()
        keccak.update(Buffer.from(pubKeyWithoutFirstByte))
        const hashOfPubKey = keccak.digest('binary')
        return hashOfPubKey.subarray(12, hashOfPubKey.length)
    },

    recoverSignerUserId(signature: Uint8Array, payload: Uint8Array): UserIDRaw {
        const publicKey = ECDSA_SECP256K1_EVM.recoverPublicKey(signature, payload)
        return ECDSA_SECP256K1_EVM.publicKeyToAddress(publicKey)
    },

    async verifySignature(expectedUserId: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        try {
            const recoveredAddress = ECDSA_SECP256K1_EVM.recoverSignerUserId(signature, payload)
            return areEqualBinaries(recoveredAddress, expectedUserId)
        } catch {
            return false
        }
    }
} as const

/**
 * Signing scheme using ECDSA with secp256r1 curve and SHA-256, natively supported by browsers
 */
export const ECDSA_SECP256R1: SigningUtil = {
    async generateKeyPair(): Promise<KeyPair> {
        const keyPair = await subtleCrypto.generateKey(
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            true, // extractable
            ['sign'] // key usages - cannot be empty
        )

        const publicKey = new Uint8Array(await subtleCrypto.exportKey('raw', keyPair.publicKey))

        // For some stupid reason, importing/exporting the private key as 'raw' is not possible
        const privateKeyPkcs8 = await subtleCrypto.exportKey('pkcs8', keyPair.privateKey)

        return {
            publicKey,
            privateKey: new Uint8Array(privateKeyPkcs8),
        }
    },

    async createSignature(payload: Uint8Array, privateKeyPkcs8: Uint8Array): Promise<Uint8Array> {
        const key = await subtleCrypto.importKey(
            'pkcs8',
            privateKeyPkcs8,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false,
            ['sign']
        )

        const signature = await subtleCrypto.sign(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            key,
            payload
        )

        return new Uint8Array(signature)
    },

    async verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const key = await subtleCrypto.importKey(
            'raw',
            publicKey,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false,
            ['verify']
        )

        const isValid = await subtleCrypto.verify(
            {
                name: 'ECDSA',
                hash: { name: 'SHA-256' }
            },
            key,
            signature,
            payload
        )

        return isValid
    }
} as const

/**
 * Signing scheme using ML-DSA-87
 */
export const ML_DSA_87: SigningUtil = {
    async generateKeyPair(): Promise<KeyPair> {
        const seed = randomBytes(32)
        const keys = ml_dsa87.keygen(seed)
        return {
            privateKey: keys.secretKey,
            publicKey: keys.publicKey,
        }
    },

    async createSignature(payload: Uint8Array, privateKey: Uint8Array, seed?: Uint8Array): Promise<Uint8Array> {
        return ml_dsa87.sign(privateKey, payload, seed)
    },

    async verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        return ml_dsa87.verify(publicKey, payload, signature)
    }
} as const
