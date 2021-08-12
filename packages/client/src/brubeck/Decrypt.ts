import { StreamMessage } from 'streamr-client-protocol'

import EncryptionUtil, { UnableToDecryptError } from './encryption/Encryption'
import { SubscriberKeyExchange } from './encryption/KeyExchangeSubscriber'
import { BrubeckCached } from './Cached'
import { PipelineTransform } from '../utils/Pipeline'
import { Context } from '../utils/Context'
import { Stoppable } from '../utils/Stoppable'
import { instanceId } from '../utils'

type IDecrypt<T> = {
    decrypt: PipelineTransform<StreamMessage<T>>
}

export type DecryptWithExchangeOptions<T> = {
    onError?: (err: Error, streamMessage?: StreamMessage<T>) => Promise<void> | void
}

export class Decrypt<T> implements IDecrypt<T>, Context, Stoppable {
    id
    debug
    isStopped = false

    constructor(
        context: Context,
        private streamEndpoints: BrubeckCached,
        private keyExchange: SubscriberKeyExchange,
        private options: DecryptWithExchangeOptions<T>,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.decrypt = this.decrypt.bind(this)
    }

    private async onError(err: Error, streamMessage?: StreamMessage<T>) {
        if (this.options.onError) {
            await this.options.onError(err, streamMessage)
        }
    }

    async* decrypt(src: AsyncGenerator<StreamMessage<T>>) {
        for await (const streamMessage of src) {
            if (this.isStopped) { return }

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

                EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                await this.keyExchange.addNewKey(streamMessage)
            } catch (err) {
                this.debug('Decrypt Error', err)
                // clear cached permissions if cannot decrypt, likely permissions need updating
                this.streamEndpoints.clearStream(streamMessage.getStreamId())
                await this.onError(err, streamMessage)
            } finally {
                yield streamMessage
            }
        }
    }
    async start() {
        this.isStopped = false
    }

    async stop() {
        this.isStopped = true
    }
}
