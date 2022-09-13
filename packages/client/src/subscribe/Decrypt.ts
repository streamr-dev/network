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

// TODO remove this when we implement the non-polling key retrieval
const waitForCondition = async (
    conditionFn: () => (boolean | Promise<boolean>),
    timeout = 5000,
    retryInterval = 100,
    onTimeoutContext?: () => string,
): Promise<void> => {
    // create error beforehand to capture more usable stack
    const err = new Error(`waitForCondition: timed out before "${conditionFn.toString()}" became true`)
    return new Promise((resolve, reject) => {
        let poller: NodeJS.Timeout | undefined = undefined
        const clearPoller = () => {
            if (poller !== undefined) {
                clearInterval(poller)
            }
        }
        const maxTime = Date.now() + timeout
        const poll = async () => {
            if (Date.now() < maxTime) {
                let result
                try {
                    result = await conditionFn()
                } catch (e) {
                    clearPoller()
                    reject(e)
                }
                if (result) {
                    clearPoller()
                    resolve()
                }
            } else {
                clearPoller()
                if (onTimeoutContext) {
                    err.message += `\n${onTimeoutContext()}`
                }
                reject(err)
            }
        }
        setTimeout(poll, 0)
        poller = setInterval(poll, retryInterval)
    })
}

export class Decrypt<T> implements Context {
    readonly id
    readonly debug
    private isStopped = false

    constructor(
        context: Context,
        private groupKeyStoreFactory: GroupKeyStoreFactory,
        private keyExchange: SubscriberKeyExchange,
        private streamRegistryCached: StreamRegistryCached,
        private destroySignal: DestroySignal,
        @inject(ConfigInjectionToken.Timeouts) private timeoutsConfig: TimeoutsConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.decrypt = this.decrypt.bind(this)
        this.destroySignal.onDestroy.listen(async () => {
            if (!this.isStopped) {
                await this.stop()
            }
        })
    }

    // TODO if this.isStopped is true, would it make sense to reject the promise
    // and not to return the original encrypted message?
    // - e.g. StoppedError, which is not visible to end-user
    async decrypt(streamMessage: StreamMessage<T>): Promise<StreamMessage<T>> {
        if (this.isStopped) {
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
                    await waitForCondition(async () => {  // TODO and implement without polling (and wrap with "withTimeout")
                        groupKey = await store.get(groupKeyId)
                        return (groupKey !== undefined) || this.isStopped
                    }, this.timeoutsConfig.encryptionKeyRequest)
                } catch (e: any) {
                    throw new DecryptError(streamMessage, `Could not get GroupKey ${streamMessage.groupKeyId}`)
                }
                if (this.isStopped) {
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
        this.debug('stop')
        this.isStopped = true
    }
}
