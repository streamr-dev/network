import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyErrorResponse, Errors
} from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { pOnce, instanceId } from '../utils'
import { Context } from '../utils/Context'
import Publisher from '../Publisher'
import GroupKeyStoreFactory from './GroupKeyStoreFactory'

import EncryptionUtil, { GroupKey, StreamMessageProcessingError } from './Encryption'
import { KeyExchangeStream } from './KeyExchangeUtils'

import { StreamEndpointsCached } from '../StreamEndpointsCached'

const { ValidationError } = Errors

class InvalidGroupKeyRequestError extends ValidationError {
    code: string
    constructor(...args: ConstructorParameters<typeof ValidationError>) {
        super(...args)
        this.code = 'INVALID_GROUP_KEY_REQUEST'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

async function catchKeyExchangeError(keyExchangeStream: KeyExchangeStream, streamMessage: StreamMessage, fn: (...args: any[]) => Promise<void>) {
    try {
        return await fn()
    } catch (error) {
        const subscriberId = streamMessage.getPublisherId()
        if (!GroupKeyRequest.is(streamMessage)) {
            // ignore weird message
            return undefined
        }

        const msg = streamMessage.getParsedContent()
        const { streamId, requestId, groupKeyIds } = GroupKeyRequest.fromArray(msg)
        return keyExchangeStream.response(subscriberId, new GroupKeyErrorResponse({
            requestId,
            streamId,
            errorCode: error.code || 'UNEXPECTED_ERROR',
            errorMessage: error.message,
            groupKeyIds
        }))
    }
}

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange implements Context {
    enabled = true
    id
    debug
    getSubscription

    constructor(
        @inject(delay(() => Publisher)) private publisher: Publisher,
        private groupKeyStoreFactory: GroupKeyStoreFactory,
        private streamEndpoints: StreamEndpointsCached,
        private keyExchangeStream: KeyExchangeStream,
    ) {
        this.id = instanceId(this)
        this.debug = this.publisher.debug.extend(this.id)
        const getSubscription = pOnce(this.subscribe.bind(this))
        this.getSubscription = getSubscription
        this.onKeyExchangeMessage = this.onKeyExchangeMessage.bind(this)
    }

    private async onKeyExchangeMessage(streamMessage?: StreamMessage) {
        if (!streamMessage) { return }

        await catchKeyExchangeError(this.keyExchangeStream, streamMessage, async () => {
            if (!GroupKeyRequest.is(streamMessage)) {
                return
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromArray(streamMessage.getParsedContent())

            const subscriberId = streamMessage.getPublisherId()

            const isSubscriber = await this.streamEndpoints.isStreamSubscriber(streamId, subscriberId)
            const groupKeyStore = await this.groupKeyStoreFactory.getStore(streamId)
            const encryptedGroupKeys = (!isSubscriber ? [] : await Promise.all(groupKeyIds.map(async (id) => {
                const groupKey = await groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }
                const key = EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true)
                return new EncryptedGroupKey(id, key)
            }))).filter(Boolean) as EncryptedGroupKey[]

            this.debug('Subscriber requested groupKeys: %d. Got: %d. %o', groupKeyIds.length, encryptedGroupKeys.length, {
                subscriberId,
                groupKeyIds,
                responseKeys: encryptedGroupKeys.map(({ groupKeyId }) => groupKeyId),
            })

            const response = new GroupKeyResponse({
                streamId,
                requestId,
                encryptedGroupKeys,
            })

            this.keyExchangeStream.response(subscriberId, response)
        }).catch(async (err: Error | StreamMessageProcessingError) => {
            if (!('streamMessage' in err)) {
                this.debug('error', err)
                return // do nothing, supress.
            }

            // wrap error and translate into ErrorResponse.
            await catchKeyExchangeError(this.keyExchangeStream, err.streamMessage, () => { // eslint-disable-line promise/no-promise-in-callback
                // rethrow so catchKeyExchangeError handles it
                throw new InvalidGroupKeyRequestError(err.message)
            })
        })
    }

    private async subscribe() {
        if (!this.enabled) { return undefined }
        const sub = await this.keyExchangeStream.subscribe()
        if (!sub) { return undefined }

        if (!this.enabled) {
            await sub.unsubscribe()
            return undefined
        }

        sub.consume(this.onKeyExchangeMessage)

        return sub
    }

    async getGroupKeyStore(streamId: string) {
        return this.groupKeyStoreFactory.getStore(streamId)
    }

    async rotateGroupKey(streamId: string) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        await groupKeyStore.rotateGroupKey()
    }

    async setNextGroupKey(streamId: string, groupKey: GroupKey) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return }

        await groupKeyStore.setNextGroupKey(groupKey)
    }

    async useGroupKey(streamId: string) {
        await this.getSubscription()
        if (!this.enabled) { return [] }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return [] }
        return groupKeyStore.useGroupKey()
    }

    async hasAnyGroupKey(streamId: string) {
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return false }
        return !(await groupKeyStore.isEmpty())
    }

    async rekey(streamId: string) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return }
        await groupKeyStore.rekey()
        if (!this.enabled) { return }
        await this.getSubscription()
    }

    async start() {
        this.enabled = true
        await this.subscribe()
    }

    async stop() {
        this.enabled = false
        this.getSubscription.reset()
        await this.subscribe()
    }
}
