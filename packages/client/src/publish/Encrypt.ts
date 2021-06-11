import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../stream/encryption/Encryption'
import { Stream } from '../stream'
import { StreamrClient } from '../StreamrClient'
import { PublisherKeyExhange } from '../stream/encryption/KeyExchangePublisher'

const { StreamMessage } = MessageLayer

export default function Encrypt(client: StreamrClient) {
    let publisherKeyExchange: PublisherKeyExhange | undefined

    function getPublisherKeyExchange() {
        if (!publisherKeyExchange) {
            publisherKeyExchange = new PublisherKeyExhange(client, {
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

        const { messageType } = streamMessage
        if (
            messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
        ) {
            // never encrypt
            return
        }

        if (
            !stream.requireEncryptedData
            && !(await (getPublisherKeyExchange().hasAnyGroupKey(stream.id)))
        ) {
            // not needed
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }

        const [groupKey, nextGroupKey] = await getPublisherKeyExchange().useGroupKey(stream.id)
        if (!groupKey) {
            throw new Error(`Tried to use group key but no group key found for stream: ${stream.id}`)
        }

        await EncryptionUtil.encryptStreamMessage(streamMessage, groupKey, nextGroupKey)
    }

    return Object.assign(encrypt, {
        setNextGroupKey(...args: Parameters<PublisherKeyExhange['setNextGroupKey']>) {
            return getPublisherKeyExchange().setNextGroupKey(...args)
        },
        rotateGroupKey(...args: Parameters<PublisherKeyExhange['rotateGroupKey']>) {
            return getPublisherKeyExchange().rotateGroupKey(...args)
        },
        rekey(...args: Parameters<PublisherKeyExhange['rekey']>) {
            return getPublisherKeyExchange().rekey(...args)
        },
        start() {
            return getPublisherKeyExchange().start()
        },
        async stop() {
            if (!publisherKeyExchange) { return }
            const exchange = publisherKeyExchange
            publisherKeyExchange = undefined
            await exchange.stop()
        }
    })
}
