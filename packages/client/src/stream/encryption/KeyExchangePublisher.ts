import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyErrorResponse, Errors
} from 'streamr-client-protocol'
import pMemoize from 'p-memoize'

import { pOne } from '../../utils'

import { validateOptions } from '../utils'
import EncryptionUtil, { GroupKey, StreamMessageProcessingError } from './Encryption'
import type { Subscription } from '../../subscribe'
import { StreamrClient } from '../../StreamrClient'
import GroupKeyStore from './GroupKeyStore'
import {
    subscribeToKeyExchangeStream,
    parseGroupKeys,
    getKeyExchangeStreamId,
    GroupKeysSerialized
} from './KeyExchangeUtils'

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

async function catchKeyExchangeError(client: StreamrClient, streamMessage: StreamMessage, fn: (...args: any[]) => Promise<void>) {
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
        return client.publish(getKeyExchangeStreamId(subscriberId), new GroupKeyErrorResponse({
            requestId,
            streamId,
            errorCode: error.code || 'UNEXPECTED_ERROR',
            errorMessage: error.message,
            groupKeyIds
        }))
    }
}

async function PublisherKeyExchangeSubscription(client: StreamrClient, getGroupKeyStore: (streamId: string) => Promise<GroupKeyStore>) {
    async function onKeyExchangeMessage(_parsedContent: any, streamMessage: StreamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            if (!GroupKeyRequest.is(streamMessage)) {
                return
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromArray(streamMessage.getParsedContent())

            const subscriberId = streamMessage.getPublisherId()

            const groupKeyStore = await getGroupKeyStore(streamId)
            const isSubscriber = await client.isStreamSubscriber(streamId, subscriberId)
            const encryptedGroupKeys = (!isSubscriber ? [] : await Promise.all(groupKeyIds.map(async (id) => {
                const groupKey = await groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }
                const key = EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true)
                return new EncryptedGroupKey(id, key)
            }))).filter(Boolean) as EncryptedGroupKey[]

            client.debug('Publisher: Subscriber requested groupKeys: %d. Got: %d. %o', groupKeyIds.length, encryptedGroupKeys.length, {
                subscriberId,
                groupKeyIds,
                responseKeys: encryptedGroupKeys.map(({ groupKeyId }) => groupKeyId),
            })

            const response = new GroupKeyResponse({
                streamId,
                requestId,
                encryptedGroupKeys,
            })

            // hack overriding toStreamMessage method to set correct encryption type
            const toStreamMessage = response.toStreamMessage.bind(response)
            response.toStreamMessage = (...args) => {
                const msg = toStreamMessage(...args)
                msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.RSA
                return msg
            }

            await client.publish(getKeyExchangeStreamId(subscriberId), response)
        })
    }

    const sub = await subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
    if (!sub) { return undefined }

    sub.on('error', (err: Error | StreamMessageProcessingError) => {
        if (!('streamMessage' in err)) {
            return // do nothing
        }

        // wrap error and translate into ErrorResponse.
        catchKeyExchangeError(client, err.streamMessage, () => { // eslint-disable-line promise/no-promise-in-callback
            // rethrow so catchKeyExchangeError handles it
            throw new InvalidGroupKeyRequestError(err.message)
        }).catch((unexpectedError) => {
            sub.emit('error', unexpectedError)
        })
    })

    return sub
}

type KeyExchangeOptions = {
    groupKeys?: Record<string, GroupKeysSerialized>
}

export class PublisherKeyExchange {
    enabled = true
    client
    initialGroupKeys
    cleanupFns: ((...args: any[]) => any)[]
    sub?: Subscription
    private getSubTask?: Promise<Subscription | undefined>

    constructor(client: StreamrClient, { groupKeys = {} }: KeyExchangeOptions = {}) {
        this.client = client
        this.initialGroupKeys = groupKeys
        this.cleanupFns = []
        this.getSub = pOne(this.getSub.bind(this))
        this.getGroupKeyStore = pMemoize(this.getGroupKeyStore.bind(this), {
            cacheKey([maybeStreamId]) {
                const { streamId } = validateOptions(maybeStreamId)
                return streamId
            }
        })
    }

    async getSub(): Promise<Subscription | undefined> {
        if (!this.enabled) {
            if (this.sub) {
                await this.sub.cancel()
            }

            if (this.getSubTask) {
                return this.getSubTask
            }

            return undefined
        }

        if (this.sub) { return this.sub }

        if (this.getSubTask) { return this.getSubTask }

        this.getSubTask = PublisherKeyExchangeSubscription(this.client, this.getGroupKeyStore).finally(() => {
            this.getSubTask = undefined
        }).then(async (sub) => {
            if (!this.enabled && sub) {
                await sub.cancel()
                return undefined
            }
            this.sub = sub
            return sub
        })

        return this.getSubTask
    }

    async getGroupKeyStore(streamId: string) {
        const clientId = await this.client.getAddress()
        const store = new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
        })
        this.cleanupFns.push(async () => {
            try {
                await store.close()
            } catch (_err) {
                // whatever

            }
        })
        return store
    }

    async rotateGroupKey(streamId: string) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        await groupKeyStore.rotateGroupKey()
    }

    async setNextGroupKey(streamId: string, groupKey: GroupKey) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)

        await groupKeyStore.setNextGroupKey(groupKey)
    }

    async useGroupKey(streamId: string) {
        await this.getSub()
        if (!this.enabled) { return [] }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        return groupKeyStore.useGroupKey()
    }

    async hasAnyGroupKey(streamId: string) {
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        return !(await groupKeyStore.isEmpty())
    }

    async rekey(streamId: string) {
        if (!this.enabled) { return }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return }
        await groupKeyStore.rekey()
        if (!this.enabled) { return }
        await this.getSub()
    }

    async start() {
        this.enabled = true
        await this.getSub()
    }

    async stop() {
        pMemoize.clear(this.getGroupKeyStore)
        this.enabled = false
        await this.getSub()
        const { cleanupFns } = this
        this.cleanupFns = []
        await Promise.allSettled(cleanupFns)
    }
}
