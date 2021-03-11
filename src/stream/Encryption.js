import crypto from 'crypto'
import util from 'util'

// this is shimmed out for actual browser build allows us to run tests in node against browser API
import { Crypto } from 'node-webcrypto-ossl'
import { arrayify, hexlify } from '@ethersproject/bytes'
import { MessageLayer } from 'streamr-client-protocol'

import { uuid } from '../utils'

export class UnableToDecryptError extends Error {
    constructor(message = '', streamMessage) {
        super(`Unable to decrypt. ${message} ${util.inspect(streamMessage)}`)
        this.streamMessage = streamMessage
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

class InvalidGroupKeyError extends Error {
    constructor(message, groupKey) {
        super(message)
        this.groupKey = groupKey
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export class GroupKey {
    static InvalidGroupKeyError = InvalidGroupKeyError

    static validate(maybeGroupKey) {
        if (!maybeGroupKey) {
            throw new InvalidGroupKeyError(`value must be a ${this.name}: ${util.inspect(maybeGroupKey)}`)
        }

        if (!(maybeGroupKey instanceof this)) {
            throw new InvalidGroupKeyError(`value must be a ${this.name}: ${util.inspect(maybeGroupKey)}`)
        }

        if (!maybeGroupKey.id || typeof maybeGroupKey.id !== 'string') {
            throw new InvalidGroupKeyError(`${this.name} id must be a string: ${util.inspect(maybeGroupKey)}`)
        }

        if (!maybeGroupKey.data || !Buffer.isBuffer(maybeGroupKey.data)) {
            throw new InvalidGroupKeyError(`${this.name} data must be a buffer: ${util.inspect(maybeGroupKey)}`)
        }

        if (!maybeGroupKey.hex || typeof maybeGroupKey.hex !== 'string') {
            throw new InvalidGroupKeyError(`${this.name} hex must be a string: ${util.inspect(maybeGroupKey)}`)
        }

        if (maybeGroupKey.data.length !== 32) {
            throw new InvalidGroupKeyError(`Group key must have a size of 256 bits, not ${maybeGroupKey.data.length * 8}`)
        }
    }

    constructor(groupKeyId, groupKeyBufferOrHexString) {
        this.id = groupKeyId
        if (!groupKeyId) {
            throw new InvalidGroupKeyError(`groupKeyId must not be falsey ${util.inspect(groupKeyId)}`)
        }

        if (!groupKeyBufferOrHexString) {
            throw new InvalidGroupKeyError(`groupKeyBufferOrHexString must not be falsey ${util.inspect(groupKeyBufferOrHexString)}`)
        }

        if (typeof groupKeyBufferOrHexString === 'string') {
            this.hex = groupKeyBufferOrHexString
            this.data = Buffer.from(this.hex, 'hex')
        } else {
            this.data = groupKeyBufferOrHexString
            this.hex = Buffer.from(this.data).toString('hex')
        }

        this.constructor.validate(this)
    }

    equals(other) {
        if (!(other instanceof GroupKey)) {
            return false
        }

        return this === other || (this.hex === other.hex && this.id === other.id)
    }

    toString() {
        return this.id
    }

    static generate(id = uuid('GroupKey')) {
        const keyBytes = crypto.randomBytes(32)
        return new GroupKey(id, keyBytes)
    }

    static from(maybeGroupKey) {
        if (!maybeGroupKey || typeof maybeGroupKey !== 'object') {
            throw new InvalidGroupKeyError(`Group key must be object ${util.inspect(maybeGroupKey)}`)
        }

        if (maybeGroupKey instanceof GroupKey) {
            return maybeGroupKey
        }

        try {
            return new GroupKey(maybeGroupKey.id || maybeGroupKey.groupKeyId, maybeGroupKey.hex || maybeGroupKey.data || maybeGroupKey.groupKeyHex)
        } catch (err) {
            if (err instanceof InvalidGroupKeyError) {
                // wrap err with logging of original object
                throw new InvalidGroupKeyError(`${err.message}. From: ${util.inspect(maybeGroupKey)}`)
            }
            throw err
        }
    }
}

const { StreamMessage } = MessageLayer

function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf))
}

// shim browser btoa for node
function btoa(str) {
    if (global.btoa) { return global.btoa(str) }
    let buffer

    if (str instanceof Buffer) {
        buffer = str
    } else {
        buffer = Buffer.from(str.toString(), 'binary')
    }

    return buffer.toString('base64')
}

async function exportCryptoKey(key, { isPrivate = false } = {}) {
    const WebCrypto = new Crypto()
    const keyType = isPrivate ? 'pkcs8' : 'spki'
    const exported = await WebCrypto.subtle.exportKey(keyType, key)
    const exportedAsString = ab2str(exported)
    const exportedAsBase64 = btoa(exportedAsString)
    const TYPE = isPrivate ? 'PRIVATE' : 'PUBLIC'
    return `-----BEGIN ${TYPE} KEY-----\n${exportedAsBase64}\n-----END ${TYPE} KEY-----\n`
}

// put all static functions into EncryptionUtilBase, with exception of create,
// so it's clearer what the static & instance APIs look like
class EncryptionUtilBase {
    static validatePublicKey(publicKey) {
        if (typeof publicKey !== 'string' || !publicKey.startsWith('-----BEGIN PUBLIC KEY-----')
            || !publicKey.endsWith('-----END PUBLIC KEY-----\n')) {
            throw new Error('"publicKey" must be a PKCS#8 RSA public key as a string in the PEM format')
        }
    }

    static validatePrivateKey(privateKey) {
        if (typeof privateKey !== 'string' || !privateKey.startsWith('-----BEGIN PRIVATE KEY-----')
            || !privateKey.endsWith('-----END PRIVATE KEY-----\n')) {
            throw new Error('"privateKey" must be a PKCS#8 RSA public key as a string in the PEM format')
        }
    }

    static validateGroupKey(groupKey) {
        return GroupKey.validate(groupKey)
    }

    /*
     * Returns a Buffer or a hex String
     */
    static encryptWithPublicKey(plaintextBuffer, publicKey, outputInHex = false) {
        this.validatePublicKey(publicKey)
        const ciphertextBuffer = crypto.publicEncrypt(publicKey, plaintextBuffer)
        if (outputInHex) {
            return hexlify(ciphertextBuffer).slice(2)
        }
        return ciphertextBuffer
    }

    /*
     * Both 'data' and 'groupKey' must be Buffers. Returns a hex string without the '0x' prefix.
     */
    static encrypt(data, groupKey) {
        GroupKey.validate(groupKey)
        const iv = crypto.randomBytes(16) // always need a fresh IV when using CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', groupKey.data, iv)
        return hexlify(iv).slice(2) + cipher.update(data, null, 'hex') + cipher.final('hex')
    }

    /*
     * 'ciphertext' must be a hex string (without '0x' prefix), 'groupKey' must be a Buffer. Returns a Buffer.
     */
    static decrypt(ciphertext, groupKey) {
        GroupKey.validate(groupKey)
        const iv = arrayify(`0x${ciphertext.slice(0, 32)}`)
        const decipher = crypto.createDecipheriv('aes-256-ctr', groupKey.data, iv)
        return Buffer.concat([decipher.update(ciphertext.slice(32), 'hex', null), decipher.final(null)])
    }

    /*
     * Sets the content of 'streamMessage' with the encryption result of the old content with 'groupKey'.
     */

    static encryptStreamMessage(streamMessage, groupKey) {
        GroupKey.validate(groupKey)
        /* eslint-disable no-param-reassign */
        streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
        streamMessage.groupKeyId = groupKey.id
        streamMessage.serializedContent = this.encrypt(Buffer.from(streamMessage.getSerializedContent(), 'utf8'), groupKey)
        streamMessage.parsedContent = undefined
        /* eslint-enable no-param-reassign */
    }

    /*
     * Decrypts the serialized content of 'streamMessage' with 'groupKey'. If the resulting plaintext is the concatenation
     * of a new group key and a message content, sets the content of 'streamMessage' with that message content and returns
     * the key. If the resulting plaintext is only a message content, sets the content of 'streamMessage' with that
     * message content and returns null.
     */

    static decryptStreamMessage(streamMessage, groupKey) {
        if ((streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES)) {
            return null
        }

        try {
            GroupKey.validate(groupKey)
        } catch (err) {
            throw new UnableToDecryptError(`${err.message}`, streamMessage)
        }

        /* eslint-disable no-param-reassign */
        try {
            streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE
            const serializedContent = this.decrypt(streamMessage.getSerializedContent(), groupKey).toString()
            streamMessage.parsedContent = JSON.parse(serializedContent)
            streamMessage.serializedContent = serializedContent
        } catch (err) {
            streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
            throw new UnableToDecryptError(err.message, streamMessage)
        }
        return null
        /* eslint-enable no-param-reassign */
    }
}

/** @internal */
export default class EncryptionUtil extends EncryptionUtilBase {
    /**
     * Creates a new instance + waits for ready.
     * Convenience.
     */

    static async create(...args) {
        const encryptionUtil = new EncryptionUtil(...args)
        await encryptionUtil.onReady()
        return encryptionUtil
    }

    constructor(options = {}) {
        super(options)
        if (options.privateKey && options.publicKey) {
            EncryptionUtil.validatePrivateKey(options.privateKey)
            EncryptionUtil.validatePublicKey(options.publicKey)
            this.privateKey = options.privateKey
            this.publicKey = options.publicKey
        }
    }

    async onReady() {
        if (this.isReady()) { return undefined }
        return this._generateKeyPair()
    }

    isReady() {
        return !!this.privateKey
    }

    // Returns a Buffer
    decryptWithPrivateKey(ciphertext, isHexString = false) {
        if (!this.isReady()) { throw new Error('EncryptionUtil not ready.') }
        let ciphertextBuffer = ciphertext
        if (isHexString) {
            ciphertextBuffer = arrayify(`0x${ciphertext}`)
        }
        return crypto.privateDecrypt(this.privateKey, ciphertextBuffer)
    }

    // Returns a String (base64 encoding)
    getPublicKey() {
        if (!this.isReady()) { throw new Error('EncryptionUtil not ready.') }
        return this.publicKey
    }

    async _generateKeyPair() {
        if (!this._generateKeyPairPromise) {
            this._generateKeyPairPromise = this.__generateKeyPair()
        }
        return this._generateKeyPairPromise
    }

    async __generateKeyPair() {
        if (process.browser) { return this._keyPairBrowser() }
        return this._keyPairServer()
    }

    async _keyPairServer() {
        const generateKeyPair = util.promisify(crypto.generateKeyPair)
        const { publicKey, privateKey } = await generateKeyPair('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
            },
        })

        this.privateKey = privateKey
        this.publicKey = publicKey
    }

    async _keyPairBrowser() {
        const WebCrypto = new Crypto()
        const { publicKey, privateKey } = await WebCrypto.subtle.generateKey({
            name: 'RSA-OAEP',
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256'
        }, true, ['encrypt', 'decrypt'])

        const [exportedPrivate, exportedPublic] = await Promise.all([
            exportCryptoKey(privateKey, {
                isPrivate: true,
            }),
            exportCryptoKey(publicKey, {
                isPrivate: false,
            })
        ])
        this.privateKey = exportedPrivate
        this.publicKey = exportedPublic
    }
}
