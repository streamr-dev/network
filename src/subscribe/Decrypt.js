import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil, { UnableToDecryptError } from '../stream/encryption/Encryption'
import { SubscriberKeyExchange } from '../stream/encryption/KeyExchangeSubscriber'

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
                    throw new UnableToDecryptError(`Group key not found: ${streamMessage.groupKeyId}`, streamMessage)
                }
                await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                await keyExchange.addNewKey(streamMessage)
            } catch (err) {
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
