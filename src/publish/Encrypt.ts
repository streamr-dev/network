import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../stream/Encryption'
import { Stream } from '../stream'
import { StreamrClient } from '../StreamrClient'
import { PublisherKeyExhange } from '../stream/KeyExchange'

const { StreamMessage } = MessageLayer

type PublisherKeyExhangeAPI = ReturnType<typeof PublisherKeyExhange>

export default function Encrypt(client: StreamrClient) {
    let publisherKeyExchange: ReturnType<typeof PublisherKeyExhange>

    function getPublisherKeyExchange() {
        if (!publisherKeyExchange) {
            publisherKeyExchange = PublisherKeyExhange(client, {
                groupKeys: {
                    ...client.options.groupKeys,
                }
            })
        }
        return publisherKeyExchange
    }

    async function encrypt(streamMessage: MessageLayer.StreamMessage, stream: Stream) {
        if (!client.canEncrypt()) {
            return
        }

        if (
            !stream.requireEncryptedData
            && !getPublisherKeyExchange().hasAnyGroupKey(stream.id)
        ) {
            // not needed
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }

        const [groupKey, nextGroupKey] = await getPublisherKeyExchange().useGroupKey(stream.id)
        await EncryptionUtil.encryptStreamMessage(streamMessage, groupKey, nextGroupKey)
    }

    return Object.assign(encrypt, {
        setNextGroupKey(...args: Parameters<PublisherKeyExhangeAPI['setNextGroupKey']>) {
            return getPublisherKeyExchange().setNextGroupKey(...args)
        },
        rotateGroupKey(...args: Parameters<PublisherKeyExhangeAPI['rotateGroupKey']>) {
            return getPublisherKeyExchange().rotateGroupKey(...args)
        },
        start() {
            return getPublisherKeyExchange().start()
        },
        stop() {
            if (!publisherKeyExchange) { return Promise.resolve() }
            return getPublisherKeyExchange().stop()
        }
    })
}
