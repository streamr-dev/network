import crypto from 'crypto'
import { O } from 'ts-toolbelt'
import { promisify } from 'util'
import { arrayify, hexlify } from '@ethersproject/bytes'
import { StreamMessage, EncryptedGroupKey, StreamMessageError } from 'streamr-client-protocol'
import { GroupKey } from './GroupKey'

const { webcrypto } = crypto

function getSubtle(): any {
    // @ts-expect-error webcrypto.subtle does not currently exist in node types
    const subtle = typeof window !== 'undefined' ? window?.crypto?.subtle : webcrypto.subtle
    if (!subtle) {
        const url = 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(`SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS) & Node 16+. ${url}`)
    }
    return subtle
}

export class StreamMessageProcessingError extends StreamMessageError {
    constructor(message = '', streamMessage: StreamMessage) {
        super(`Could not process. ${message}`, streamMessage)
    }
}

export class UnableToDecryptError extends StreamMessageProcessingError {
    constructor(message = '', streamMessage: StreamMessage) {
        super(`Unable to decrypt. ${message}`, streamMessage)
    }
}

function ab2str(...args: any[]): string {
    // @ts-ignore
    return String.fromCharCode.apply(null, new Uint8Array(...args))
}

// shim browser btoa for node
function btoa(str: string | Uint8Array): string {
    if (global.btoa) { return global.btoa(str as string) }
    let buffer

    if (Buffer.isBuffer(str)) {
        buffer = str
    } else {
        buffer = Buffer.from(str.toString(), 'binary')
    }

    return buffer.toString('base64')
}

async function exportCryptoKey(key: CryptoKey, { isPrivate = false } = {}): Promise<string> {
    const keyType = isPrivate ? 'pkcs8' : 'spki'
    const exported = await getSubtle().exportKey(keyType, key)
    const exportedAsString = ab2str(exported)
    const exportedAsBase64 = btoa(exportedAsString)
    const TYPE = isPrivate ? 'PRIVATE' : 'PUBLIC'
    return `-----BEGIN ${TYPE} KEY-----\n${exportedAsBase64}\n-----END ${TYPE} KEY-----\n`
}

// put all static functions into EncryptionUtilBase, with exception of create,
// so it's clearer what the static & instance APIs look like
class EncryptionUtilBase {
    static validatePublicKey(publicKey: crypto.KeyLike): void|never {
        const keyString = typeof publicKey === 'string' ? publicKey : publicKey.toString('utf8')
        if (typeof keyString !== 'string' || !keyString.startsWith('-----BEGIN PUBLIC KEY-----')
            || !keyString.endsWith('-----END PUBLIC KEY-----\n')) {
            throw new Error('"publicKey" must be a PKCS#8 RSA public key in the PEM format')
        }
    }

    /**
     * Returns a Buffer or a hex String
     */
    /* eslint-disable no-dupe-class-members */
    static encryptWithPublicKey(plaintextBuffer: Uint8Array, publicKey: crypto.KeyLike, outputInHex: true): string
    // These overrides tell ts outputInHex returns string
    static encryptWithPublicKey(plaintextBuffer: Uint8Array, publicKey: crypto.KeyLike): string
    static encryptWithPublicKey(plaintextBuffer: Uint8Array, publicKey: crypto.KeyLike, outputInHex: false): Buffer
    static encryptWithPublicKey(plaintextBuffer: Uint8Array, publicKey: crypto.KeyLike, outputInHex: boolean = false) {
        this.validatePublicKey(publicKey)
        const ciphertextBuffer = crypto.publicEncrypt(publicKey, plaintextBuffer)
        if (outputInHex) {
            return hexlify(ciphertextBuffer).slice(2)
        }
        return ciphertextBuffer
    }
    /* eslint-disable no-dupe-class-members */

    /*
     * Both 'data' and 'groupKey' must be Buffers. Returns a hex string without the '0x' prefix.
     */
    static encrypt(data: Uint8Array, groupKey: GroupKey): string {
        GroupKey.validate(groupKey)
        const iv = crypto.randomBytes(16) // always need a fresh IV when using CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', groupKey.data, iv)

        return hexlify(iv).slice(2) + cipher.update(data, undefined, 'hex') + cipher.final('hex')
    }

    /*
     * 'ciphertext' must be a hex string (without '0x' prefix), 'groupKey' must be a GroupKey. Returns a Buffer.
     */
    static decrypt(ciphertext: string, groupKey: GroupKey): Buffer {
        GroupKey.validate(groupKey)
        const iv = arrayify(`0x${ciphertext.slice(0, 32)}`)
        const decipher = crypto.createDecipheriv('aes-256-ctr', groupKey.data, iv)
        return Buffer.concat([decipher.update(ciphertext.slice(32), 'hex'), decipher.final()])
    }

    /*
     * Sets the content of 'streamMessage' with the encryption result of the old content with 'groupKey'.
     */

    static encryptStreamMessage(streamMessage: StreamMessage, groupKey: GroupKey, nextGroupKey?: GroupKey): void {
        GroupKey.validate(groupKey)
        /* eslint-disable no-param-reassign */
        streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
        streamMessage.groupKeyId = groupKey.id

        if (nextGroupKey) {
            GroupKey.validate(nextGroupKey)
            // @ts-expect-error
            streamMessage.newGroupKey = nextGroupKey
        }

        streamMessage.serializedContent = this.encrypt(Buffer.from(streamMessage.getSerializedContent(), 'utf8'), groupKey)
        if (nextGroupKey) {
            GroupKey.validate(nextGroupKey)
            streamMessage.newGroupKey = new EncryptedGroupKey(nextGroupKey.id, this.encrypt(nextGroupKey.data, groupKey))
        }
        streamMessage.parsedContent = undefined
        /* eslint-enable no-param-reassign */
    }

    /*
     * Decrypts the serialized content of 'streamMessage' with 'groupKey'. If the resulting plaintext is the concatenation
     * of a new group key and a message content, sets the content of 'streamMessage' with that message content and returns
     * the key. If the resulting plaintext is only a message content, sets the content of 'streamMessage' with that
     * message content and returns null.
     */

    static decryptStreamMessage(streamMessage: StreamMessage, groupKey: GroupKey): any {
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
            throw new UnableToDecryptError(err.stack, streamMessage)
        }

        try {
            const { newGroupKey } = streamMessage
            if (newGroupKey) {
                // newGroupKey should be EncryptedGroupKey | GroupKey, but GroupKey is not defined in protocol
                // @ts-expect-error
                streamMessage.newGroupKey = GroupKey.from([
                    newGroupKey.groupKeyId,
                    this.decrypt(newGroupKey.encryptedGroupKeyHex, groupKey)
                ])
            }
        } catch (err) {
            streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
            throw new UnableToDecryptError('Could not decrypt new group key: ' + err.stack, streamMessage)
        }
        return null
        /* eslint-enable no-param-reassign */
    }
}

// after EncryptionUtil is ready
type InitializedEncryptionUtil = O.Overwrite<EncryptionUtil, {
    privateKey: string,
    publicKey: string,
}>

export class EncryptionUtil extends EncryptionUtilBase {
    /**
     * Creates a new instance + waits for ready.
     * Convenience.
     */

    static async create(): Promise<EncryptionUtil> {
        const encryptionUtil = new EncryptionUtil()
        await encryptionUtil.onReady()
        return encryptionUtil
    }

    privateKey: string | undefined
    publicKey: string | undefined
    private _generateKeyPairPromise: Promise<void> | undefined

    async onReady(): Promise<void> {
        if (this.isReady()) { return undefined }
        return this._generateKeyPair()
    }

    isReady(this: EncryptionUtil): this is InitializedEncryptionUtil {
        return (this.privateKey !== undefined && this.publicKey !== undefined)
    }

    // Returns a Buffer
    decryptWithPrivateKey(ciphertext: string | Uint8Array, isHexString = false): Buffer {
        if (!this.isReady()) { throw new Error('EncryptionUtil not ready.') }
        const ciphertextBuffer = isHexString ? arrayify(`0x${ciphertext}`) : ciphertext as Uint8Array
        return crypto.privateDecrypt(this.privateKey, ciphertextBuffer)
    }

    // Returns a String (base64 encoding)
    getPublicKey(): string {
        if (!this.isReady()) { throw new Error('EncryptionUtil not ready.') }
        return this.publicKey
    }

    async _generateKeyPair(): Promise<void> {
        if (!this._generateKeyPairPromise) {
            this._generateKeyPairPromise = this.__generateKeyPair()
        }
        return this._generateKeyPairPromise
    }

    async __generateKeyPair(): Promise<void> {
        if (typeof window !== 'undefined') { return this._keyPairBrowser() }
        return this._keyPairServer()
    }

    async _keyPairServer(): Promise<void> {
        // promisify here to work around browser/server packaging
        const generateKeyPair = promisify(crypto.generateKeyPair)
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

    async _keyPairBrowser(): Promise<void> {
        const { publicKey, privateKey } = await getSubtle().generateKey({
            name: 'RSA-OAEP',
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256'
        }, true, ['encrypt', 'decrypt'])
        if (!(publicKey && privateKey)) {
            // TS says this is possible.
            throw new Error('could not generate keys')
        }

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
