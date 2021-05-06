import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyErrorResponse, Errors
} from 'streamr-client-protocol'
import pMemoize from 'p-memoize'

import Scaffold from '../../utils/Scaffold'

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

async function PublisherKeyExhangeSubscription(client: StreamrClient, getGroupKeyStore: (streamId: string) => Promise<GroupKeyStore>) {
    async function onKeyExchangeMessage(_parsedContent: any, streamMessage: StreamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST) {
                return Promise.resolve()
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

            return client.publish(getKeyExchangeStreamId(subscriberId), response)
        })
    }

    const sub = await subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
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

type KeyExhangeOptions = {
    groupKeys?: Record<string, GroupKeysSerialized>
}

export function PublisherKeyExhange(client: StreamrClient, { groupKeys = {} }: KeyExhangeOptions = {}) {
    let enabled = true
    const getGroupKeyStore = pMemoize(async (streamId) => {
        const clientId = await client.getAddress()
        return new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(groupKeys[streamId]).entries()]
        })
    }, {
        cacheKey([maybeStreamId]) {
            const { streamId } = validateOptions(maybeStreamId)
            return streamId
        }
    })

    let sub: Subscription | undefined
    const next = Scaffold([
        async () => {
            sub = await PublisherKeyExhangeSubscription(client, getGroupKeyStore)
            return async () => {
                if (!sub) { return }
                const cancelTask = sub.cancel()
                sub = undefined
                await cancelTask
            }
        }
    ], async () => enabled)

    async function rotateGroupKey(streamId: string) {
        if (!enabled) { return }
        const groupKeyStore = await getGroupKeyStore(streamId)
        await groupKeyStore.rotateGroupKey()
    }

    async function setNextGroupKey(streamId: string, groupKey: GroupKey) {
        if (!enabled) { return }
        const groupKeyStore = await getGroupKeyStore(streamId)

        await groupKeyStore.setNextGroupKey(groupKey)
    }

    async function useGroupKey(streamId: string) {
        await next()
        if (!enabled) { return [] }
        const groupKeyStore = await getGroupKeyStore(streamId)
        return groupKeyStore.useGroupKey()
    }

    async function hasAnyGroupKey(streamId: string) {
        const groupKeyStore = await getGroupKeyStore(streamId)
        return !groupKeyStore.isEmpty()
    }

    async function rekey(streamId: string) {
        if (!enabled) { return }
        const groupKeyStore = await getGroupKeyStore(streamId)
        await groupKeyStore.rekey()
        await next()
    }

    return {
        setNextGroupKey,
        useGroupKey,
        rekey,
        rotateGroupKey,
        hasAnyGroupKey,
        async start() {
            enabled = true
            return next()
        },
        async stop() {
            pMemoize.clear(getGroupKeyStore)
            enabled = false
            return next()
        }
    }
}
