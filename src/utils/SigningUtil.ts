import secp256k1 from 'secp256k1'
import { Keccak } from 'sha3'

const SIGN_MAGIC = '\u0019Ethereum Signed Message:\n'
const keccak = new Keccak(256)

function hash(messageBuffer: Buffer) {
    const prefixString = SIGN_MAGIC + messageBuffer.length
    const merged = Buffer.concat([Buffer.from(prefixString, 'utf-8'), messageBuffer])
    keccak.reset()
    keccak.update(merged)
    return keccak.digest('binary')
}

function recoverPublicKey(signatureBuffer: Buffer, payloadBuffer: Buffer) {
    const recoveryId = signatureBuffer.readUInt8(signatureBuffer.length - 1) - 27
    return secp256k1.ecdsaRecover(
        signatureBuffer.subarray(0, signatureBuffer.length - 1),
        recoveryId,
        hash(payloadBuffer),
        false,
        Buffer.alloc,
    )
}

export default class SigningUtil {
    static async sign(payload: string, privateKey: string) {
        const payloadBuffer = Buffer.from(payload, 'utf-8')
        const privateKeyBuffer = Buffer.from(privateKey, 'hex')

        const msgHash = hash(payloadBuffer)
        const sigObj = secp256k1.ecdsaSign(msgHash, privateKeyBuffer)
        const result = Buffer.alloc(sigObj.signature.length + 1, Buffer.from(sigObj.signature))
        result.writeInt8(27 + sigObj.recid, result.length - 1)
        return '0x' + result.toString('hex')
    }

    static async recover(signature: string, payload: string, publicKeyBuffer: Buffer | Uint8Array | undefined = undefined) {
        const signatureBuffer = Buffer.from(signature.startsWith('0x') ? signature.substring(2) : signature, 'hex') // remove '0x' prefix
        const payloadBuffer = Buffer.from(payload, 'utf-8')

        if (!publicKeyBuffer) {
            // eslint-disable-next-line no-param-reassign
            publicKeyBuffer = recoverPublicKey(signatureBuffer, payloadBuffer)
        }
        const pubKeyWithoutFirstByte = publicKeyBuffer.subarray(1, publicKeyBuffer.length)
        keccak.reset()
        keccak.update(Buffer.from(pubKeyWithoutFirstByte))
        const hashOfPubKey = keccak.digest('binary')
        return '0x' + hashOfPubKey.subarray(12, hashOfPubKey.length).toString('hex')
    }

    static async verify(address: string, payload: string, signature: string) {
        try {
            const recoveredAddress = await SigningUtil.recover(signature, payload)
            return recoveredAddress.toLowerCase() === address.toLowerCase()
        } catch (err) {
            return false
        }
    }
}
