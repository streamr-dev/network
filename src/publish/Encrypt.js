import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../stream/Encryption'
import { PublisherKeyExhange } from '../stream/KeyExchange'

const { StreamMessage } = MessageLayer

export default function Encrypt(client) {
    const publisherKeyExchange = PublisherKeyExhange(client, {
        groupKeys: {
            ...client.options.groupKeys,
        }
    })
    async function encrypt(streamMessage, stream) {
        if (
            !publisherKeyExchange.hasAnyGroupKey(stream.id)
            && !stream.requireEncryptedData
        ) {
            // not needed
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }
        const groupKey = await publisherKeyExchange.useGroupKey(stream.id)
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
