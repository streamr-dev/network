import crypto from 'crypto'

import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'

import UnableToDecryptError from './errors/UnableToDecryptError'

const { StreamMessage } = MessageLayer

export default class EncryptionUtil {
    /*
    Both 'data' and 'groupKey' must be Buffers. Returns a hex string without the '0x' prefix.
     */
    static encrypt(data, groupKey) {
        const iv = crypto.randomBytes(16) // always need a fresh IV when using CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', groupKey, iv)
        return ethers.utils.hexlify(iv).slice(2) + cipher.update(data, null, 'hex') + cipher.final('hex')
    }

    /*
    'ciphertext' must be a hex string (without '0x' prefix), 'groupKey' must be a Buffer. Returns a Buffer.
     */
    static decrypt(ciphertext, groupKey) {
        const iv = ethers.utils.arrayify(`0x${ciphertext.slice(0, 32)}`)
        const decipher = crypto.createDecipheriv('aes-256-ctr', groupKey, iv)
        return Buffer.concat([decipher.update(ciphertext.slice(32), 'hex', null), decipher.final(null)])
    }

    /*
    Sets the content of 'streamMessage' with the encryption result of the old content with 'groupKey'.
     */
    static encryptStreamMessage(streamMessage, groupKey) {
        /* eslint-disable no-param-reassign */
        streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
        streamMessage.serializedContent = this.encrypt(Buffer.from(streamMessage.getSerializedContent(), 'utf8'), groupKey)
        streamMessage.parsedContent = undefined
        /* eslint-enable no-param-reassign */
    }

    /*
    Sets the content of 'streamMessage' with the encryption result of a plaintext with 'groupKey'. The
    plaintext is the concatenation of 'newGroupKey' and the old serialized content of 'streamMessage'.
     */
    static encryptStreamMessageAndNewKey(newGroupKey, streamMessage, groupKey) {
        /* eslint-disable no-param-reassign */
        streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES
        const plaintext = Buffer.concat([newGroupKey, Buffer.from(streamMessage.getSerializedContent(), 'utf8')])
        streamMessage.serializedContent = EncryptionUtil.encrypt(plaintext, groupKey)
        streamMessage.parsedContent = undefined
        /* eslint-enable no-param-reassign */
    }

    /*
    Decrypts the serialized content of 'streamMessage' with 'groupKey'. If the resulting plaintext is the concatenation
    of a new group key and a message content, sets the content of 'streamMessage' with that message content and returns
    the key. If the resulting plaintext is only a message content, sets the content of 'streamMessage' with that
    message content and returns null.
     */
    static decryptStreamMessage(streamMessage, groupKey) {
        /* eslint-disable no-param-reassign */
        if (streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.AES) {
            streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE
            const serializedContent = this.decrypt(streamMessage.getSerializedContent(), groupKey).toString()
            try {
                streamMessage.parsedContent = JSON.parse(serializedContent)
                streamMessage.serializedContent = serializedContent
            } catch (err) {
                throw new UnableToDecryptError(streamMessage)
            }
        } else if (streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES) {
            streamMessage.encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE
            const plaintext = this.decrypt(streamMessage.getSerializedContent(), groupKey)
            const serializedContent = plaintext.slice(32).toString()
            try {
                streamMessage.parsedContent = JSON.parse(serializedContent)
                streamMessage.serializedContent = serializedContent
            } catch (err) {
                throw new UnableToDecryptError(streamMessage)
            }
            return plaintext.slice(0, 32)
        }
        return null
        /* eslint-enable no-param-reassign */
    }
}
