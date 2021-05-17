import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil, { UnableToDecryptError } from '../stream/encryption/Encryption'
import { SubscriberKeyExchange } from '../stream/encryption/KeyExchangeSubscriber'

const { StreamMessage } = MessageLayer

export default function Decrypt(client, options = {}) {
    if (!client.options.keyExchange) {
        // noop unless message encrypted
        return (streamMessage) => {
            if (streamMessage.groupKeyId) {
                throw new UnableToDecryptError('No keyExchange configured, cannot decrypt any message.', streamMessage)
            }

            return streamMessage
        }
    }

    const keyExchange = new SubscriberKeyExchange(client, {
        ...options,
        groupKeys: {
            ...client.options.groupKeys,
            ...options.groupKeys,
        }
    })

    async function* decrypt(src, onError = async () => {}) {
        for await (const streamMessage of src) {
            if (!streamMessage.groupKeyId) {
                yield streamMessage
                continue
            }

            if (streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES) {
                yield streamMessage
                continue
            }

            try {
                const groupKey = await keyExchange.getGroupKey(streamMessage).catch((err) => {
                    throw new UnableToDecryptError(`Could not get GroupKey: ${streamMessage.groupKeyId} – ${err.message}`, streamMessage)
                })

                if (!groupKey) {
                    throw new UnableToDecryptError([
                        `Could not get GroupKey: ${streamMessage.groupKeyId}`,
                        'Publisher is offline, key does not exist or no permission to access key.',
                    ].join(' '), streamMessage)
                }

                await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                await keyExchange.addNewKey(streamMessage)
            } catch (err) {
                // clear cached permissions if cannot decrypt, likely permissions need updating
                client.cached.clearStream(streamMessage.getStreamId())
                await onError(err, streamMessage)
            } finally {
                yield streamMessage
            }
        }
    }

    return Object.assign(decrypt, {
        async stop() {
            return keyExchange.stop()
        }
    })
}
