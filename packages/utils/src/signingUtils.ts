/* eslint-disable @typescript-eslint/no-extraneous-class */
import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa'
import { randomBytes } from '@noble/post-quantum/utils'
import { p256 } from '@noble/curves/p256'
import { areEqualBinaries, binaryToHex } from './binaryUtils'
import { UserIDRaw } from './UserID'
import { getSubtle } from './crossPlatformCrypto'
import { JsonWebKey } from 'crypto'

const SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
const keccak = new Keccak(256)

const subtleCrypto = getSubtle()

export interface KeyPair {
    publicKey: Uint8Array
    privateKey: Uint8Array
}

export interface SigningUtil {
    generateKeyPair: () => KeyPair
    createSignature: (payload: Uint8Array, privateKey: Uint8Array) => Promise<Uint8Array>
    verifySignature: (publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array) => Promise<boolean>
    // Needs to be sync because often validated in constructors
    assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void
}

/**
 * EVM compatible ECDSA signing scheme using keccak hash, magic bytes, and secp256k1 curve.
 */
export const ECDSA_SECP256K1_EVM: SigningUtil & {
    keccakHash(message: Uint8Array, useEthereumMagic?: boolean): Buffer
    recoverPublicKey(signature: Uint8Array, payload: Uint8Array): Uint8Array
    publicKeyToAddress(publicKey: Uint8Array): Uint8Array
    recoverSignerUserId(signature: Uint8Array, payload: Uint8Array): UserIDRaw
} = {

    generateKeyPair(): KeyPair {
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
        if (publicKey.length !== 65) {
            throw new Error(`Expected 65 bytes (an ECDSA uncompressed public key with header byte). Got length: ${publicKey.length}`)
        }
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
    },

    assertValidKeyPair(address: UserIDRaw, privateKey: Uint8Array): void {
        const computedPublicKey = secp256k1.publicKeyCreate(privateKey, false)
        const computedAddress = ECDSA_SECP256K1_EVM.publicKeyToAddress(computedPublicKey)
        if (!areEqualBinaries(address, computedAddress)) {
            throw new Error(`Given private key is for a different address! Given: ${binaryToHex(address)}, Computed: ${binaryToHex(computedAddress)}`)
        }
    }
} as const

/**
 * Signing scheme using ECDSA with secp256r1 curve and SHA-256, natively supported by browsers
 */
export const ECDSA_SECP256R1: SigningUtil & {
    privateKeyToJwt(privateKey: Uint8Array): JsonWebKey
} = {
    generateKeyPair(): KeyPair {
        const privateKey = randomBytes(32)
        const publicKey = p256.getPublicKey(privateKey, true)

        return {
            publicKey,
            privateKey,
        }
    },

    privateKeyToJwt(privateKey: Uint8Array): JsonWebKey {
        // publicKey = [header (1 byte), x (32 bytes), y (32 bytes)
        const publicKey = p256.getPublicKey(privateKey, false)
        const x = publicKey.subarray(1, 33)
        const xEncoded = Buffer.from(x).toString('base64url')
        const y = publicKey.subarray(33)
        const yEncoded = Buffer.from(y).toString('base64url')

        return {
            key_ops: [ 'sign' ],
            ext: true,
            kty: 'EC',
            x: xEncoded,
            y: yEncoded,
            crv: 'P-256',
            d: Buffer.from(privateKey).toString('base64url')
        }
    },

    async createSignature(payload: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
        const key = await subtleCrypto.importKey(
            'jwk',
            ECDSA_SECP256R1.privateKeyToJwt(privateKey),
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
    },

    assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void {
        if (privateKey.length !== 32) {
            throw new Error(`Expected a raw private key of 32 bytes. Maybe your key is in some encapsulating format?`)
        }
        if (publicKey.length !== 33 && publicKey.length !== 65) {
            throw new Error(`Expected a public key of either 33 bytes (compressed) or 65 bytes (uncompressed)!`)
        }

        const computedPublicKey = p256.getPublicKey(privateKey, publicKey.length === 33)
        
        if (binaryToHex(computedPublicKey) !== binaryToHex(publicKey)) {
            throw new Error(
                `Given private key is for a different public key! Given: ${binaryToHex(publicKey)}, Computed: ${binaryToHex(computedPublicKey)}`
            )
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

    async createSignature(payload: Uint8Array, privateKey: Uint8Array, seed?: Uint8Array): Promise<Uint8Array> {
        return ml_dsa87.sign(privateKey, payload, seed)
    },

    async verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        return ml_dsa87.verify(publicKey, payload, signature)
    },

    assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void {
        // Validity of key pair is tested by signing and validating something
        const payload = Buffer.from('data-to-sign')
        const signature = ml_dsa87.sign(privateKey, payload)
        if (!ml_dsa87.verify(publicKey, payload, signature)) {
            throw new Error(`The given ML-DSA public key and private key don't seem to match!`)
        }
    }

} as const
