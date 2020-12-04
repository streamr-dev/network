import { LimitAsyncFnByKey } from '../utils'
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

    const queue = LimitAsyncFnByKey(1)
    const requestKey = SubscriberKeyExchange(client, options)
    async function decrypt(streamMessage) {
        return queue(streamMessage.getStreamId(), async () => {
            if (!streamMessage.groupKeyId) { return streamMessage }
            const groupKey = await requestKey(streamMessage)
            if (!groupKey) { return streamMessage }

            return EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
        })
    }

    return Object.assign(decrypt, {
        stop() {
            queue.clear()
            return requestKey.stop()
        }
    })
}
