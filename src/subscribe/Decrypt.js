import { MessageLayer } from 'streamr-client-protocol'

import PushQueue from '../utils/PushQueue'
import EncryptionUtil, { UnableToDecryptError } from '../stream/Encryption'
import { SubscriberKeyExchange } from '../stream/KeyExchange'

const { StreamMessage } = MessageLayer

export default function Decrypt(client, options = {}) {
    if (!client.options.keyExchange) {
        // noop unless message encrypted
        return (streamMessage) => {
            if (streamMessage.groupKeyId) {
                throw new Error('No keyExchange configured, cannot decrypt message.')
            }

            return streamMessage
        }
    }

    const requestKey = SubscriberKeyExchange(client, {
        ...options,
        groupKeys: {
            ...client.options.groupKeys,
            ...options.groupKeys,
        }
    })

    async function* decrypt(src, onError = async (err) => { throw err }) {
        yield* PushQueue.transform(src, async (streamMessage) => {
            if (!streamMessage.groupKeyId) {
                return streamMessage
            }

            if (streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES) {
                return streamMessage
            }

            try {
                const groupKey = await requestKey(streamMessage)
                if (!groupKey) {
                    throw new UnableToDecryptError(`Group key not found: ${streamMessage.groupKeyId}`, streamMessage)
                }
                await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                return streamMessage
            } catch (err) {
                await onError(err, streamMessage)
            }

            return streamMessage
        })
    }

    return Object.assign(decrypt, {
        stop() {
            return requestKey.stop()
        }
    })
}
