import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, GroupKeyErrorResponse, EncryptedGroupKey, Errors
} from 'streamr-client-protocol'
import mem from 'mem'
import pMemoize from 'p-memoize'

import { uuid, Defer } from '../utils'
import Scaffold from '../utils/Scaffold'

import { validateOptions } from './utils'
import EncryptionUtil, { GroupKey, GroupKeyish, StreamMessageProcessingError } from './Encryption'
import type { Subscription } from '../subscribe'
import { StreamrClient } from '../StreamrClient'
import PersistentStore from './PersistentStore'

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

const { ValidationError } = Errors

export function isKeyExchangeStream(id = '') {
    return id.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

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

/*
class InvalidGroupKeyResponseError extends Error {
    constructor(...args) {
        super(...args)
        this.code = 'INVALID_GROUP_KEY_RESPONSE'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

class InvalidContentTypeError extends Error {
    constructor(...args) {
        super(...args)
        this.code = 'INVALID_MESSAGE_TYPE'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
*/

type Address = string
type GroupKeyId = string

function getKeyExchangeStreamId(address: Address) {
    if (isKeyExchangeStream(address)) {
        return address // prevent ever double-handling
    }
    return `${KEY_EXCHANGE_STREAM_PREFIX}/${address.toLowerCase()}`
}

type GroupKeyStoreOptions = {
    clientId: string,
    streamId: string,
    groupKeys: [GroupKeyId, GroupKey][]
}

function GroupKeyStore({ clientId, streamId, groupKeys }: GroupKeyStoreOptions) {
    const store = new PersistentStore({ clientId, streamId })

    let currentGroupKeyId: GroupKeyId | undefined // current key id if any
    const nextGroupKeys: GroupKey[] = [] // the keys to use next, disappears if not actually used. Max queue size 2

    groupKeys.forEach(([groupKeyId, groupKey]) => {
        GroupKey.validate(groupKey)
        if (groupKeyId !== groupKey.id) {
            throw new Error(`Ids must match: groupKey.id: ${groupKey.id}, groupKeyId: ${groupKeyId}`)
        }
        // use last init key as current
        currentGroupKeyId = groupKey.id
    })

    async function storeKey(groupKey: GroupKey) {
        GroupKey.validate(groupKey)
        const existingKey = await store.get(groupKey.id)
        if (existingKey) {
            if (!existingKey.equals(groupKey)) {
                throw new GroupKey.InvalidGroupKeyError(
                    `Trying to add groupKey ${groupKey.id} but key exists & is not equivalent to new GroupKey: ${groupKey}.`,
                    groupKey
                )
            }

            await store.set(groupKey.id, existingKey)
            return existingKey
        }

        await store.set(groupKey.id, groupKey)
        return groupKey
    }

    return {
        async has(id: GroupKeyId) {
            if (currentGroupKeyId === id) { return true }

            if (nextGroupKeys.some((nextKey) => nextKey.id === id)) { return true }

            return store.has(id)
        },
        async isEmpty() {
            return !nextGroupKeys.length && await store.size() === 0
        },
        async useGroupKey(): Promise<[GroupKey | undefined, GroupKey | undefined]> {
            const nextGroupKey = nextGroupKeys.pop()
            // First use of group key on this stream, no current key. Make next key current.
            if (!currentGroupKeyId && nextGroupKey) {
                await storeKey(nextGroupKey)
                currentGroupKeyId = nextGroupKey.id
                return [
                    await this.get(currentGroupKeyId),
                    undefined,
                ]
            }

            // Keep using current key (empty next)
            if (currentGroupKeyId != null && !nextGroupKey) {
                return [
                    await this.get(currentGroupKeyId),
                    undefined
                ]
            }

            // Key changed (non-empty next). return current + next. Make next key current.
            if (currentGroupKeyId != null && nextGroupKey != null) {
                await storeKey(nextGroupKey)
                const prevGroupKey = await this.get(currentGroupKeyId)
                currentGroupKeyId = nextGroupKey.id
                // use current key one more time
                return [
                    prevGroupKey,
                    nextGroupKey,
                ]
            }

            // Generate & use new key if none already set.
            await this.rotateGroupKey()
            return this.useGroupKey()
        },
        async get(id: GroupKeyId) {
            return store.get(id)
        },
        async clear() {
            currentGroupKeyId = undefined
            nextGroupKeys.length = 0
            return store.clear()
        },
        async rotateGroupKey() {
            return this.setNextGroupKey(GroupKey.generate())
        },
        async add(groupKey: GroupKey) {
            return storeKey(groupKey)
        },
        async setNextGroupKey(newKey: GroupKey) {
            GroupKey.validate(newKey)
            nextGroupKeys.unshift(newKey)
            nextGroupKeys.length = Math.min(nextGroupKeys.length, 2)
        },
        async rekey() {
            const newKey = GroupKey.generate()
            await storeKey(newKey)
            currentGroupKeyId = newKey.id
            nextGroupKeys.length = 0
        }
    }
}

type GroupKeyStorage = ReturnType<typeof GroupKeyStore>
type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

function parseGroupKeys(groupKeys: GroupKeysSerialized = {}): Map<GroupKeyId, GroupKey> {
    return new Map<GroupKeyId, GroupKey>(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean) as [])
}

type MessageMatch = (content: any, streamMessage: StreamMessage) => boolean

function waitForSubMessage(sub: Subscription, matchFn: MessageMatch) {
    const task = Defer()
    const onMessage = (content: any, streamMessage: StreamMessage) => {
        try {
            if (matchFn(content, streamMessage)) {
                task.resolve(streamMessage)
            }
        } catch (err) {
            task.reject(err)
        }
    }
    sub.on('message', onMessage)
    sub.once('error', task.reject)
    task.finally(() => {
        sub.off('message', onMessage)
        sub.off('error', task.reject)
    }).catch(() => {}) // important: prevent unchained finally cleanup causing unhandled rejection
    return task
}

async function subscribeToKeyExchangeStream(client: StreamrClient, onKeyExchangeMessage: (msg: any, streamMessage: StreamMessage) => void) {
    const { options } = client
    if ((!options.auth!.privateKey && !options.auth!.ethereum) || !options.keyExchange) {
        return Promise.resolve()
    }

    await client.session.getSessionToken() // trigger auth errors if any
    // subscribing to own keyexchange stream
    const publisherId = await client.getUserId()
    const streamId = getKeyExchangeStreamId(publisherId)
    const sub = await client.subscribe(streamId, onKeyExchangeMessage)
    sub.on('error', () => {}) // errors should not shut down subscription
    return sub
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

async function PublisherKeyExhangeSubscription(client: StreamrClient, getGroupKeyStore: (streamId: string) => Promise<GroupKeyStorage>) {
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
        return GroupKeyStore({
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

async function getGroupKeysFromStreamMessage(streamMessage: StreamMessage, encryptionUtil: EncryptionUtil) {
    const { encryptedGroupKeys } = GroupKeyResponse.fromArray(streamMessage.getParsedContent())
    return Promise.all(encryptedGroupKeys.map(async (encryptedGroupKey) => (
        new GroupKey(
            encryptedGroupKey.groupKeyId,
            await encryptionUtil.decryptWithPrivateKey(encryptedGroupKey.encryptedGroupKeyHex, true)
        )
    )))
}

async function SubscriberKeyExhangeSubscription(
    client: StreamrClient,
    getGroupKeyStore: (streamId: string) => Promise<GroupKeyStorage>,
    encryptionUtil: EncryptionUtil
) {
    let sub: Subscription
    async function onKeyExchangeMessage(_parsedContent: any, streamMessage: StreamMessage) {
        try {
            const { messageType } = streamMessage
            const { MESSAGE_TYPES } = StreamMessage
            if (messageType !== MESSAGE_TYPES.GROUP_KEY_ANNOUNCE) {
                return
            }

            const groupKeys = await getGroupKeysFromStreamMessage(streamMessage, encryptionUtil)
            const groupKeyStore = await getGroupKeyStore(streamMessage.getStreamId())
            await Promise.all(groupKeys.map(async (groupKey) => (
                groupKeyStore.add(groupKey)
            )))
        } catch (err) {
            sub.emit('error', err)
        }
    }

    sub = await subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
    sub.on('error', () => {}) // errors should not shut down subscription
    return sub
}

export function SubscriberKeyExchange(client: StreamrClient, { groupKeys = {} }: KeyExhangeOptions = {}) {
    let enabled = true
    const encryptionUtil = new EncryptionUtil(client.options.keyExchange)

    const getGroupKeyStore = pMemoize(async (streamId) => {
        const clientId = await client.getAddress()
        return GroupKeyStore({
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
    let requestKeysStep: () => Promise<void>
    async function requestKeys({ streamId, publisherId, groupKeyIds }: {
        streamId: string,
        publisherId: string,
        groupKeyIds: GroupKeyId[]
    }) {
        let done = false
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let responseTask: ReturnType<typeof Defer>
        let cancelTask: ReturnType<typeof Defer>
        let receivedGroupKeys: GroupKey[] = []
        let response: any
        const step = Scaffold([
            async () => {
                if (!sub) { throw new Error('no subscription') }
                cancelTask = Defer()
                responseTask = waitForSubMessage(sub, (content, streamMessage) => {
                    const { messageType } = streamMessage
                    const matchesMessageType = (
                        messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
                        || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
                    )

                    if (!matchesMessageType) {
                        return false
                    }

                    const groupKeyResponse = GroupKeyResponse.fromArray(content)
                    return groupKeyResponse.requestId === requestId
                })

                cancelTask.then(responseTask.resolve).catch(responseTask.reject)
                return () => {
                    cancelTask.resolve(undefined)
                }
            }, async () => {
                const msg = new GroupKeyRequest({
                    streamId,
                    requestId,
                    rsaPublicKey,
                    groupKeyIds,
                })
                await client.publish(keyExchangeStreamId, msg)
            }, async () => {
                response = await responseTask
                return () => {
                    response = undefined
                }
            }, async () => {
                receivedGroupKeys = response ? await getGroupKeysFromStreamMessage(response, encryptionUtil) : []

                return () => {
                    receivedGroupKeys = []
                }
            },
        ], async () => enabled && !done, {
            id: `requestKeys.${requestId}`,
            onChange(isGoingUp) {
                if (!isGoingUp && cancelTask) {
                    cancelTask.resolve(undefined)
                }
            }
        })

        requestKeysStep = step
        await step()
        const keys = receivedGroupKeys.slice()
        done = true
        await step()
        return keys
    }

    const pending = new Map()
    const getBuffer = mem<(groupKeyId: GroupKeyId) => GroupKeyId[], [string]>(() => [])
    const timeouts: Record<string, ReturnType<typeof setTimeout>> = Object.create(null)

    async function getKey(streamMessage: StreamMessage) {
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return Promise.resolve()
        }
        const groupKeyStore = await getGroupKeyStore(streamId)

        if (!enabled) { return Promise.resolve() }
        const existingGroupKey = await groupKeyStore.get(groupKeyId)
        if (!enabled) { return Promise.resolve() }

        if (existingGroupKey) {
            return existingGroupKey
        }

        if (pending.has(groupKeyId)) {
            return pending.get(groupKeyId)
        }

        const key = `${streamId}.${publisherId}`
        const buffer = getBuffer(key)
        buffer.push(groupKeyId)
        pending.set(groupKeyId, Defer())

        async function processBuffer() {
            if (!enabled) { return }
            const currentBuffer = getBuffer(key)
            const groupKeyIds = currentBuffer.slice()
            currentBuffer.length = 0
            try {
                const receivedGroupKeys = await requestKeys({
                    streamId,
                    publisherId,
                    groupKeyIds,
                })
                if (!enabled) { return }
                await Promise.all(receivedGroupKeys.map(async (groupKey) => (
                    groupKeyStore.add(groupKey)
                )))
                if (!enabled) { return }
                await Promise.all(groupKeyIds.map(async (id) => {
                    if (!pending.has(id)) { return }
                    const groupKeyTask = groupKeyStore.get(id)
                    const task = pending.get(id)
                    pending.delete(id)
                    const groupKey = await groupKeyTask
                    task.resolve(groupKey)
                }))
            } catch (err) {
                groupKeyIds.forEach((id) => {
                    if (!pending.has(id)) { return }
                    const task = pending.get(id)
                    pending.delete(id)
                    task.reject(err)
                })
            }
        }

        if (!timeouts[key]) {
            timeouts[key] = setTimeout(() => {
                delete timeouts[key]
                processBuffer()
            }, 1000)
        }

        return pending.get(groupKeyId)
    }

    function cleanupPending() {
        Array.from(Object.entries(timeouts)).forEach(([key, value]) => {
            clearTimeout(value)
            delete timeouts[key]
        })
        const pendingValues = Array.from(pending.values())
        pending.clear()
        pendingValues.forEach((value) => {
            value.resolve(undefined)
        })
        pMemoize.clear(getGroupKeyStore)
    }

    const next = Scaffold([
        async () => {
            await encryptionUtil.onReady()
        },
        async () => {
            sub = await SubscriberKeyExhangeSubscription(client, getGroupKeyStore, encryptionUtil)
            return async () => {
                if (!sub) { return }
                const cancelTask = sub.cancel()
                sub = undefined
                await cancelTask
            }
        }
    ], async () => enabled, {
        id: `SubscriberKeyExhangeSubscription.${client.id}`,
        onChange(shouldUp) {
            if (!shouldUp) {
                cleanupPending()
            }
        },
        async onDone() {
            // clean up requestKey
            if (requestKeysStep) {
                await requestKeysStep()
            }
        }
    })

    async function getGroupKey(streamMessage: StreamMessage) {
        if (!streamMessage.groupKeyId) { return [] }
        await next()
        if (!enabled) { return [] }

        return getKey(streamMessage)
    }

    return Object.assign(getGroupKey, {
        async start() {
            enabled = true
            return next()
        },
        async addNewKey(streamMessage: StreamMessage) {
            if (!streamMessage.newGroupKey) { return }
            const streamId = streamMessage.getStreamId()
            const groupKeyStore = await getGroupKeyStore(streamId)
            const newGroupKey: unknown = streamMessage.newGroupKey
            await groupKeyStore.add(newGroupKey as GroupKey)
        },
        async stop() {
            enabled = false
            return next()
        }
    })
}
