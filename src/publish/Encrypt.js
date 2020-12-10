import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../stream/Encryption'
import { PublisherKeyExhange } from '../stream/KeyExchange'

const { StreamMessage } = MessageLayer

export default function Encrypt(client) {
    const publisherKeyExchange = PublisherKeyExhange(client) // old keys

    async function encrypt(streamMessage, stream) {
        if (
            streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE
            || (
                !publisherKeyExchange.hasAnyGroupKey()
                && !stream.requireEncryptedData
            )
        ) {
            // not needed
            return
        }

        const groupKey = await publisherKeyExchange.useGroupKey()
        await EncryptionUtil.encryptStreamMessage(streamMessage, groupKey)
    }

    return Object.assign(encrypt, {
        setNextGroupKey(...args) {
            return publisherKeyExchange.setNextGroupKey(...args)
        },
        rotateGroupKey(...args) {
            return publisherKeyExchange.rotateGroupKey(...args)
        },
        stop(...args) {
            return publisherKeyExchange.stop(...args)
        }
    })
}
