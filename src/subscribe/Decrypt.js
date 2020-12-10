import PushQueue from '../utils/PushQueue'
import EncryptionUtil from '../stream/Encryption'
import { SubscriberKeyExchange } from '../stream/KeyExchange'

export default function Decrypt(client, options) {
    if (!client.options.keyExchange) {
        // noop unless message encrypted
        return (streamMessage) => {
            if (streamMessage.groupKeyId) {
                throw new Error('No keyExchange configured, cannot decrypt message.')
            }

            return streamMessage
        }
    }

    const requestKey = SubscriberKeyExchange(client, options)

    async function* decrypt(src) {
        yield* PushQueue.transform(src, async (streamMessage) => {
            if (!streamMessage.groupKeyId) { return streamMessage }
            const groupKey = await requestKey(streamMessage)

            if (!groupKey) {
                return streamMessage
            }

            await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
            return streamMessage
        })
    }

    return Object.assign(decrypt, {
        stop() {
            return requestKey.stop()
        }
    })
}
