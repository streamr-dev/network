/* eslint-disable class-methods-use-this */
import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa'
import { randomBytes } from '@noble/post-quantum/utils'
import { p256 } from '@noble/curves/p256'
import { areEqualBinaries, binaryToHex } from './binaryUtils'
import type { UserIDRaw } from './UserID'
import { type CryptoKey, getSubtle, type Jwk } from '@/crypto'

export const KEY_TYPES = [
    'ECDSA_SECP256K1_EVM', 
    'ECDSA_SECP256R1', 
    'ML_DSA_87'
] as const

export type KeyType = typeof KEY_TYPES[number]

const ECDSA_SECP256K1_EVM_SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
let keccak: Keccak | undefined

function getKeccakInstance(): Keccak {
    keccak ??= new Keccak(256)
    return keccak
}

export interface KeyPair {
    publicKey: Uint8Array
    privateKey: Uint8Array
}

export abstract class SigningUtil {
    abstract generateKeyPair(): KeyPair
    abstract createSignature(payload: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array>
    abstract verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean>
    // Needs to be sync because often validated in constructors
    abstract assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void

    static getInstance(type: KeyType): SigningUtil {
        const util = keyTypeToInstance[type]
        if (!util) {
            throw new Error(`Unknown key pair type: ${type}`)
        }
        return util
    }
}

/**
 * EVM compatible ECDSA signing scheme using keccak hash, magic bytes, and secp256k1 curve.
 */
export class EcdsaSecp256k1Evm extends SigningUtil {
    generateKeyPair(): KeyPair {
        const privateKey = randomBytes(32)
        const publicKey = secp256k1.publicKeyCreate(privateKey, false)
        return { 
            // Return address as 'publicKey'
            publicKey: this.publicKeyToAddress(publicKey),
            privateKey, 
        }
    }

    keccakHash(message: Uint8Array, useEthereumMagic: boolean = true): Buffer {
        const keccak = getKeccakInstance()
        keccak.reset()
        keccak.update(useEthereumMagic ? Buffer.concat([
            Buffer.from(ECDSA_SECP256K1_EVM_SIGN_MAGIC + message.length), 
            message
        ]) : Buffer.from(message))
        return keccak.digest('binary')
    }

    private recoverPublicKey(signature: Uint8Array, payload: Uint8Array): Uint8Array {
        const signatureBuffer = Buffer.from(signature)
        const recoveryId = signatureBuffer.readUInt8(signatureBuffer.length - 1) - 27
        return secp256k1.ecdsaRecover(
            signatureBuffer.subarray(0, signatureBuffer.length - 1),
            recoveryId,
            this.keccakHash(payload),
            false,
            Buffer.alloc,
        )
    }

    async createSignature(payload: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
        const msgHash = this.keccakHash(payload)
        const sigObj = secp256k1.ecdsaSign(msgHash, privateKey)
        const result = Buffer.alloc(sigObj.signature.length + 1, Buffer.from(sigObj.signature))
        result.writeInt8(27 + sigObj.recid, result.length - 1)
        return result
    }

    publicKeyToAddress(publicKey: Uint8Array): Uint8Array {
        if (publicKey.length !== 65) {
            throw new Error(`Expected 65 bytes (an ECDSA uncompressed public key with header byte). Got length: ${publicKey.length}`)
        }
        const pubKeyWithoutFirstByte = publicKey.subarray(1, publicKey.length)
        const keccak = getKeccakInstance()
        keccak.reset()
        keccak.update(Buffer.from(pubKeyWithoutFirstByte))
        const hashOfPubKey = keccak.digest('binary')
        return hashOfPubKey.subarray(12, hashOfPubKey.length)
    }

    recoverSignerUserId(signature: Uint8Array, payload: Uint8Array): UserIDRaw {
        const publicKey = this.recoverPublicKey(signature, payload)
        return this.publicKeyToAddress(publicKey)
    }

    async verifySignature(expectedUserId: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        try {
            const recoveredAddress = this.recoverSignerUserId(signature, payload)
            return areEqualBinaries(recoveredAddress, expectedUserId)
        } catch {
            return false
        }
    }

    assertValidKeyPair(address: UserIDRaw, privateKey: Uint8Array): void {
        const computedPublicKey = secp256k1.publicKeyCreate(privateKey, false)
        const computedAddress = this.publicKeyToAddress(computedPublicKey)
        if (!areEqualBinaries(address, computedAddress)) {
            throw new Error(`Given private key is for a different address! Given: ${binaryToHex(address)}, Computed: ${binaryToHex(computedAddress)}`)
        }
    }
}

/**
 * Signing scheme using ECDSA with secp256r1 curve and SHA-256, natively supported by browsers
 */
export class EcdsaSecp256r1 extends SigningUtil {
    generateKeyPair(compressPublicKey: boolean = true): KeyPair {
        const privateKey = randomBytes(32)
        const publicKey = this.getPublicKeyFromPrivateKey(privateKey, compressPublicKey)

        return {
            publicKey,
            privateKey,
        }
    }

    private isCompressedPublicKey(publicKey: Uint8Array): boolean {
        return publicKey.length === 33
    }

    private isUncompressedPublicKey(publicKey: Uint8Array): boolean {
        return publicKey.length === 65
    }

    private toBase64Url(base64: string): string {
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    getPublicKeyFromPrivateKey(privateKey: Uint8Array, compressed: boolean = true): Uint8Array {
        return p256.getPublicKey(privateKey, compressed)
    }

    getUncompressedPublicKey(publicKey: Uint8Array): Uint8Array {
        if (this.isCompressedPublicKey(publicKey)) {
            // Decode compressed public key to an elliptic curve point
            const point = p256.ProjectivePoint.fromHex(publicKey)

            // Convert the point to an uncompressed public key
            return point.toRawBytes(false)
        }

        // No-op if called with already uncompressed key
        if (this.isUncompressedPublicKey(publicKey)) {
            return publicKey
        }

        throw new Error(`Unexpected public key length: ${publicKey.length}`)
    }

    privateKeyToJWK(privateKey: Uint8Array): Jwk {
        const publicKey = this.getPublicKeyFromPrivateKey(privateKey, false)
        // uncompressed publicKey = [header (1 byte), x (32 bytes), y (32 bytes)
        const x = publicKey.subarray(1, 33)
        const y = publicKey.subarray(33)

        /**
         * Warning, there are some platform-specific differences. Logging observations here:
         * - buffer.toString('base64url') works on Mac but NOT in Linux/CI
         * - importKey accepts base64 encoded variables on Mac but NOT in Linux/CI
         * For this reason, they must be base64url encoded AND we need to use our own
         * toBase64Url converter.
         */
        const xBase64 = Buffer.from(x).toString('base64')
        const yBase64 = Buffer.from(y).toString('base64')
        const privateKeyBase64 = Buffer.from(privateKey).toString('base64')

        return {
            key_ops: [ 'sign' ],
            ext: true,
            kty: 'EC',
            x: this.toBase64Url(xBase64),
            y: this.toBase64Url(yBase64),
            crv: 'P-256',
            d: this.toBase64Url(privateKeyBase64)
        }
    }

    /**
     * Pass the privateKey in JsonWebKey format for a slight performance gain.
     * You can convert raw keys to JWK using the privateKeyToJWK function.
     */
    async createSignature(payload: Uint8Array, privateKey: Uint8Array | Jwk): Promise<Uint8Array> {
        const subtleCrypto = getSubtle()

        const jwk = privateKey instanceof Uint8Array ? this.privateKeyToJWK(privateKey) : privateKey

        /**
         * Stupidly, importKey does not support the 'raw' format. This means we need to
         * first compute the JWK from the raw key, and only then we can import and use it.
         */
        const key = await subtleCrypto.importKey(
            'jwk',
            jwk,
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
    }

    private async publicKeyToCryptoKey(publicKey: Uint8Array): Promise<CryptoKey> {
        return getSubtle().importKey(
            'raw',
            publicKey,
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            false,
            ['verify']
        )
    }

    async verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        let key: CryptoKey | undefined

        try {
            key = await this.publicKeyToCryptoKey(publicKey)
        } catch (err) {
            // On some browsers (Safari), compressed keys are not supported for some reason!
            // If that might be the case, retry with an uncompressed key
            if (this.isCompressedPublicKey(publicKey)) {
                key = await this.publicKeyToCryptoKey(this.getUncompressedPublicKey(publicKey))
            } else {
                throw err
            }
        }

        const isValid = await getSubtle().verify(
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

    assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void {
        if (privateKey.length !== 32) {
            throw new Error(`Expected a raw private key of 32 bytes. Maybe your key is in some encapsulating format?`)
        }
        if (!this.isCompressedPublicKey(publicKey) && !this.isUncompressedPublicKey(publicKey)) {
            throw new Error(`Expected a public key of either 33 bytes (compressed) or 65 bytes (uncompressed)!`)
        }

        const computedPublicKey = this.getPublicKeyFromPrivateKey(privateKey, publicKey.length === 33)
        
        if (!areEqualBinaries(computedPublicKey, publicKey)) {
            throw new Error(
                `Given private key is for a different public key! Given: ${binaryToHex(publicKey)}, Computed: ${binaryToHex(computedPublicKey)}`
            )
        }
    }
}

/**
 * Signing scheme using ML-DSA-87
 */
export class MlDsa87 extends SigningUtil {
    generateKeyPair(): KeyPair {
        const seed = randomBytes(32)
        const keys = ml_dsa87.keygen(seed)
        return {
            privateKey: keys.secretKey,
            publicKey: keys.publicKey,
        }
    }

    async createSignature(payload: Uint8Array, privateKey: Uint8Array, seed?: Uint8Array): Promise<Uint8Array> {
        return ml_dsa87.sign(privateKey, payload, seed)
    }

    async verifySignature(publicKey: UserIDRaw, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        return ml_dsa87.verify(publicKey, payload, signature)
    }

    assertValidKeyPair(publicKey: UserIDRaw, privateKey: Uint8Array): void {
        // Validity of key pair is tested by signing and validating something
        const payload = Buffer.from('data-to-sign')
        const signature = ml_dsa87.sign(privateKey, payload)
        if (!ml_dsa87.verify(publicKey, payload, signature)) {
            throw new Error(`The given ML-DSA public key and private key don't match!`)
        }
    }

}

// Declared at the bottom of the file because the classes need to be
// declared first. TS makes sure all KeyPairTypes are present.
const keyTypeToInstance: Record<KeyType, SigningUtil> = {
    ECDSA_SECP256K1_EVM: new EcdsaSecp256k1Evm(),
    ECDSA_SECP256R1: new EcdsaSecp256r1(),
    ML_DSA_87: new MlDsa87()
}
