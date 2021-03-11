import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../stream/Encryption'
import { Stream } from '../stream'
import { StreamrClient } from '../StreamrClient'
import { PublisherKeyExhange } from '../stream/KeyExchange'

const { StreamMessage } = MessageLayer

type PublisherKeyExhangeAPI = ReturnType<typeof PublisherKeyExhange>

export default function Encrypt(client: StreamrClient) {
    const publisherKeyExchange = PublisherKeyExhange(client, {
        groupKeys: {
            ...client.options.groupKeys,
        }
    })
    async function encrypt(streamMessage: MessageLayer.StreamMessage, stream: Stream) {
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
        setNextGroupKey(...args: Parameters<PublisherKeyExhangeAPI['setNextGroupKey']>) {
            return publisherKeyExchange.setNextGroupKey(...args)
        },
        rotateGroupKey(...args: Parameters<PublisherKeyExhangeAPI['rotateGroupKey']>) {
            return publisherKeyExchange.rotateGroupKey(...args)
        },
        stop() {
            return publisherKeyExchange.stop()
        }
    })
}
