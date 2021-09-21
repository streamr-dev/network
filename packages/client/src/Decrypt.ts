/**
 * Decrypt StreamMessages in-place.
 */
import { StreamMessage } from 'streamr-client-protocol'

import EncryptionUtil, { UnableToDecryptError } from './encryption/Encryption'
import { SubscriberKeyExchange } from './encryption/KeyExchangeSubscriber'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { Context } from './utils/Context'
import { DestroySignal } from './DestroySignal'
import { Stoppable } from './utils/Stoppable'
import { instanceId } from './utils'

type IDecrypt<T> = {
    decrypt: (streamMessage: StreamMessage<T>) => Promise<void>
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
        private streamEndpoints: StreamEndpointsCached,
        private keyExchange: SubscriberKeyExchange,
        private destroySignal: DestroySignal,
        private options: DecryptWithExchangeOptions<T>,
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.decrypt = this.decrypt.bind(this)
        this.destroySignal.onDestroy(async () => {
            if (!this.isStopped) {
                await this.stop()
            }
        })
    }

    private async onError(err: Error, streamMessage?: StreamMessage<T>) {
        if (this.options.onError) {
            await this.options.onError(err, streamMessage)
        }
    }

    async decrypt(streamMessage: StreamMessage<T>) {
        if (this.isStopped) {
            return
        }

        if (!streamMessage.groupKeyId) {
            return
        }

        if (streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES) {
            return
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

            if (this.isStopped) { return }
            EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
            await this.keyExchange.addNewKey(streamMessage)
        } catch (err) {
            if (this.isStopped) { return }
            this.debug('Decrypt Error', err)
            // clear cached permissions if cannot decrypt, likely permissions need updating
            this.streamEndpoints.clearStream(streamMessage.getStreamId())
            await this.onError(err, streamMessage)
        }
    }

    async stop() {
        this.isStopped = true
    }
}
