/**
 * Decrypt StreamMessages in-place.
 */
import { StreamMessage } from 'streamr-client-protocol'
import { EncryptionUtil, DecryptError } from '../encryption/EncryptionUtil'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { Context } from '../utils/Context'
import { DestroySignal } from '../DestroySignal'
import { instanceId } from '../utils/utils'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { GroupKeyStoreFactory } from '../encryption/GroupKeyStoreFactory'
import { ConfigInjectionToken, TimeoutsConfig } from '../Config'
import { inject } from 'tsyringe'
import { GroupKey } from '../encryption/GroupKey'
import { waitForEvent } from '@streamr/utils'
import { StreamrClientEventEmitter } from '../events'

export class Decrypt<T> implements Context {
    readonly id
    readonly debug
    private abortController: AbortController = new AbortController()

    constructor(
        context: Context,
        private groupKeyStoreFactory: GroupKeyStoreFactory,
        private keyExchange: SubscriberKeyExchange,
        private streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        @inject(StreamrClientEventEmitter) private eventEmitter: StreamrClientEventEmitter,
        @inject(ConfigInjectionToken.Timeouts) private timeoutsConfig: TimeoutsConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.decrypt = this.decrypt.bind(this)
        destroySignal.onDestroy.listen(async () => this.stop())
    }

    // TODO if this.isStopped is true, would it make sense to reject the promise
    // and not to return the original encrypted message?
    // - e.g. StoppedError, which is not visible to end-user
    async decrypt(streamMessage: StreamMessage<T>): Promise<StreamMessage<T>> {
        if (this.abortController.signal.aborted) {
            return streamMessage
        }

        if (!streamMessage.groupKeyId) {
            return streamMessage
        }

        if (streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES) {
            return streamMessage
        }

        try {
            const groupKeyId = streamMessage.groupKeyId!
            const store = await this.groupKeyStoreFactory.getStore(streamMessage.getStreamId())

            let groupKey = await store.get(groupKeyId)
            if (groupKey === undefined) {
                await this.keyExchange.requestGroupKey(
                    streamMessage.groupKeyId,
                    streamMessage.getPublisherId(),
                    streamMessage.getStreamPartID()
                )
                try {
                    const groupKeys = await waitForEvent(
                        // TODO remove "as any" type casing in NET-889
                        this.eventEmitter as any,
                        'addGroupKey',
                        this.timeoutsConfig.encryptionKeyRequest,
                        (storedGroupKey: GroupKey) => storedGroupKey.id === groupKeyId,
                        this.abortController)
                    groupKey = groupKeys[0] as GroupKey
                } catch (e: any) {
                    throw new DecryptError(streamMessage, `Could not get GroupKey ${streamMessage.groupKeyId}`)
                }
                if (this.abortController.signal.aborted) {
                    return streamMessage
                }
            }

            const clone = StreamMessage.deserialize(streamMessage.serialize())
            EncryptionUtil.decryptStreamMessage(clone, groupKey!)
            if (streamMessage.newGroupKey) {
                // newGroupKey has been converted into GroupKey
                await store.add(clone.newGroupKey as unknown as GroupKey)
            }
            return clone as StreamMessage<T>
        } catch (err) {
            this.debug('Decrypt Error', err)
            // clear cached permissions if cannot decrypt, likely permissions need updating
            this.streamRegistryCached.clearStream(streamMessage.getStreamId())
            throw err
        }
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
