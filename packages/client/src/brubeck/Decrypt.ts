import { StreamMessage } from 'streamr-client-protocol'

import EncryptionUtil, { UnableToDecryptError } from '../stream/encryption/Encryption'
import { SubscriberKeyExchange } from '../stream/encryption/KeyExchangeSubscriber'
import { BrubeckClient } from './BrubeckClient'
import { PipelineTransform } from '../utils/Pipeline'

type IDecrypt<T> = {
    decrypt: PipelineTransform<StreamMessage<T>>
}

export type DecryptWithExchangeOptions<T> = {
    groupKeys?: any[]
    onError?: (err?: Error, streamMessage?: StreamMessage<T>) => Promise<void> | void
}

export default function Decrypt<T>(client: BrubeckClient, options: DecryptWithExchangeOptions<T> = {}): IDecrypt<T> {
    if (!client.options.keyExchange) {
        return new DecryptionDisabled<T>()
    }

    return new DecryptWithExchange<T>(client, options)
}

class DecryptionDisabled<T> implements IDecrypt<T> {
    constructor() {
        this.decrypt = this.decrypt.bind(this)
    }

    // eslint-disable-next-line class-methods-use-this
    async* decrypt(src: AsyncGenerator<StreamMessage<T>>) {
        for await (const streamMessage of src) {
            if (streamMessage.groupKeyId) {
                throw new UnableToDecryptError('No keyExchange configured, cannot decrypt any message.', streamMessage)
            }

            yield streamMessage
        }
    }
}

class DecryptWithExchange<T> implements IDecrypt<T> {
    keyExchange
    client
    onErrorFn
    constructor(client: BrubeckClient, options: DecryptWithExchangeOptions<T> = {}) {
        this.client = client
        this.onErrorFn = options.onError
        this.keyExchange = new SubscriberKeyExchange(client.client, {
            ...options,
            groupKeys: {
                ...client.options.groupKeys,
                ...options.groupKeys,
            }
        })

        this.decrypt = this.decrypt.bind(this)
    }

    private async onError(err?: Error, streamMessage?: StreamMessage<T>) {
        if (this.onErrorFn) {
            await this.onErrorFn(err, streamMessage)
        }
    }

    async* decrypt(src: AsyncGenerator<StreamMessage<T>>) {
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
                const groupKey = await this.keyExchange.getGroupKey(streamMessage).catch((err) => {
                    throw new UnableToDecryptError(`Could not get GroupKey: ${streamMessage.groupKeyId} – ${err.stack}`, streamMessage)
                })

                if (!groupKey) {
                    throw new UnableToDecryptError([
                        `Could not get GroupKey: ${streamMessage.groupKeyId}`,
                        'Publisher is offline, key does not exist or no permission to access key.',
                    ].join(' '), streamMessage)
                }

                await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                await this.keyExchange.addNewKey(streamMessage)
            } catch (err) {
                // clear cached permissions if cannot decrypt, likely permissions need updating
                this.client.client.cached.clearStream(streamMessage.getStreamId())
                await this.onError(err, streamMessage)
            } finally {
                yield streamMessage
            }
        }
    }

    async stop() {
        return this.keyExchange.stop()
    }
}
