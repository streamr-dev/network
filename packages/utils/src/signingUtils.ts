import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'
import { areEqualBinaries } from './binaryUtils'
import { UserIDRaw } from './UserID'

const SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
const keccak = new Keccak(256)

/**
 * Contains functions to creates and verifies standard Ethereum signatures.
 * These are a faster implementation than found in ether.js library. They are
 * compatible with e.g. ether.js's verifyMessage and signMessage functions.
 *
 * In Node environment the performance is significantly better compared
 * to ether.js v5.5.0.
 *
 * See test/benchmark/SigningUtils.ts and the original PR:
 * https://github.com/streamr-dev/streamr-client-protocol-js/pull/35
 */

export function hash(message: Uint8Array): Buffer {
    const prefixString = SIGN_MAGIC + message.length
    const merged = Buffer.concat([Buffer.from(prefixString), message])
    keccak.reset()
    keccak.update(merged)
    return keccak.digest('binary')
}

function recoverPublicKey(signature: Uint8Array, payload: Uint8Array): Uint8Array {
    const signatureBuffer = Buffer.from(signature)
    const recoveryId = signatureBuffer.readUInt8(signatureBuffer.length - 1) - 27
    return secp256k1.ecdsaRecover(
        signatureBuffer.subarray(0, signatureBuffer.length - 1),
        recoveryId,
        hash(payload),
        false,
        Buffer.alloc
    )
}

export function createSignature(payload: Uint8Array, privateKey: Uint8Array): Uint8Array {
    const msgHash = hash(payload)
    const sigObj = secp256k1.ecdsaSign(msgHash, privateKey)
    const result = Buffer.alloc(sigObj.signature.length + 1, Buffer.from(sigObj.signature))
    result.writeInt8(27 + sigObj.recid, result.length - 1)
    return result
}

export function recoverSignerUserId(signature: Uint8Array, payload: Uint8Array): UserIDRaw {
    const publicKey = recoverPublicKey(signature, payload)
    const pubKeyWithoutFirstByte = publicKey.subarray(1, publicKey.length)
    keccak.reset()
    keccak.update(Buffer.from(pubKeyWithoutFirstByte))
    const hashOfPubKey = keccak.digest('binary')
    return hashOfPubKey.subarray(12, hashOfPubKey.length)
}

export function verifySignature(expectedUserId: UserIDRaw, payload: Uint8Array, signature: Uint8Array): boolean {
    try {
        const recoveredAddress = recoverSignerUserId(signature, payload)
        return areEqualBinaries(recoveredAddress, expectedUserId)
    } catch {
        return false
    }
}
