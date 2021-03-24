import { MessageLayer, Errors } from 'streamr-client-protocol'
import mem from 'mem'

import { uuid, Defer } from '../utils'
import Scaffold from '../utils/Scaffold'

import { validateOptions } from './utils'
import EncryptionUtil, { GroupKey } from './Encryption'

const {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, GroupKeyErrorResponse, EncryptedGroupKey
} = MessageLayer

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

const { ValidationError } = Errors

export function isKeyExchangeStream(id = '') {
    return id.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

class InvalidGroupKeyRequestError extends ValidationError {
    constructor(...args) {
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

export function getKeyExchangeStreamId(address) {
    if (isKeyExchangeStream(address)) {
        return address // prevent ever double-handling
    }
    return `${KEY_EXCHANGE_STREAM_PREFIX}/${address.toLowerCase()}`
}

function GroupKeyStore({ groupKeys = new Map() }) {
    const store = new Map()
    groupKeys.forEach((value, key) => {
        store.set(key, value)
    })

    let currentGroupKeyId // current key id if any
    const nextGroupKeys = [] // the keys to use next, disappears if not actually used. Max queue size 2

    store.forEach((groupKey) => {
        GroupKey.validate(GroupKey.from(groupKey))
        // use last init key as current
        currentGroupKeyId = groupKey.id
    })

    function storeKey(groupKey) {
        GroupKey.validate(groupKey)
        if (store.has(groupKey.id)) {
            const existingKey = GroupKey.from(store.get(groupKey.id))
            if (!existingKey.equals(groupKey)) {
                throw new GroupKey.InvalidGroupKeyError(
                    `Trying to add groupKey ${groupKey.id} but key exists & is not equivalent to new GroupKey: ${groupKey}.`,
                    groupKey
                )
            }

            store.delete(groupKey.id) // sort key at end by deleting existing entry before re-adding
            store.set(groupKey.id, existingKey) // reuse existing instance
            return existingKey
        }

        store.set(groupKey.id, groupKey)
        return groupKey
    }

    return {
        has(groupKeyId) {
            if (currentGroupKeyId === groupKeyId) { return true }

            if (nextGroupKeys.some((nextKey) => nextKey.id === groupKeyId)) { return true }

            return store.has(groupKeyId)
        },
        isEmpty() {
            return nextGroupKeys.length === 0 && store.size === 0
        },
        useGroupKey() {
            const nextGroupKey = nextGroupKeys.pop()
            switch (true) {
                // First use of group key on this stream, no current key. Make next key current.
                case (!currentGroupKeyId && nextGroupKey): {
                    storeKey(nextGroupKey)
                    currentGroupKeyId = nextGroupKey.id
                    return [
                        this.get(currentGroupKeyId),
                        undefined,
                    ]
                }
                // Keep using current key (empty next)
                case (currentGroupKeyId && !nextGroupKey): {
                    return [
                        this.get(currentGroupKeyId),
                        undefined
                    ]
                }
                // Key changed (non-empty next). return current + next. Make next key current.
                case (currentGroupKeyId && nextGroupKey): {
                    storeKey(nextGroupKey)
                    const prevGroupKey = this.get(currentGroupKeyId)
                    currentGroupKeyId = nextGroupKey.id
                    // use current key one more time
                    return [
                        prevGroupKey,
                        nextGroupKey,
                    ]
                }
                // Generate & use new key if none already set.
                default: {
                    this.rotateGroupKey()
                    return this.useGroupKey()
                }
            }
        },
        get(groupKeyId) {
            const groupKey = store.get(groupKeyId)
            if (!groupKey) { return undefined }
            return GroupKey.from(groupKey)
        },
        clear() {
            currentGroupKeyId = undefined
            nextGroupKeys.length = 0
            return store.clear()
        },
        rotateGroupKey() {
            return this.setNextGroupKey(GroupKey.generate())
        },
        add(groupKey) {
            return storeKey(groupKey)
        },
        setNextGroupKey(newKey) {
            GroupKey.validate(newKey)
            nextGroupKeys.unshift(newKey)
            nextGroupKeys.length = Math.min(nextGroupKeys.length, 2)
        },
        rekey() {
            const newKey = GroupKey.generate()
            storeKey(newKey)
            currentGroupKeyId = newKey.id
            nextGroupKeys.length = 0
        }
    }
}

function parseGroupKeys(groupKeys = {}) {
    return new Map(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean))
}

function waitForSubMessage(sub, matchFn) {
    const task = Defer()
    const onMessage = (content, streamMessage) => {
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
    }).catch(() => {}) // prevent unhandled rejection
    return task
}

async function subscribeToKeyExchangeStream(client, onKeyExchangeMessage) {
    const { options } = client
    if ((!options.auth.privateKey && !options.auth.ethereum) || !options.keyExchange) {
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

async function catchKeyExchangeError(client, streamMessage, fn) {
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

async function PublisherKeyExhangeSubscription(client, getGroupKeyStore) {
    async function onKeyExchangeMessage(_parsedContent, streamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST) {
                return Promise.resolve()
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromArray(streamMessage.getParsedContent())

            const subscriberId = streamMessage.getPublisherId()

            const groupKeyStore = getGroupKeyStore(streamId)
            const isSubscriber = await client.isStreamSubscriber(streamId, subscriberId)
            const encryptedGroupKeys = !isSubscriber ? [] : groupKeyIds.map((id) => {
                const groupKey = groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }

                return new EncryptedGroupKey(id, EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true))
            }).filter(Boolean)

            client.debug('Publisher: Subscriber requested groupKeys: %d. Got: %d. %o', groupKeyIds.length, encryptedGroupKeys.length, {
                subscriberId,
                groupKeyIds,
                responseKeys: encryptedGroupKeys.map(({ groupKeyId }) => groupKeyId),
            })

            const response = new GroupKeyResponse({
                streamId,
                requestId,
                encryptedGroupKeys,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
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
    sub.on('error', (err) => {
        if (!err.streamMessage) {
            return // do nothing
        }

        // wrap error and translate into ErrorResponse.
        catchKeyExchangeError(client, err.streamMessage, () => { // eslint-disable-line promise/no-promise-in-callback
            // rethrow so catchKeyExchangeError handles it
            throw new InvalidGroupKeyRequestError(err.message, err.streamMessage)
        }).catch((unexpectedError) => {
            sub.emit('error', unexpectedError)
        })
    })

    return sub
}

export function PublisherKeyExhange(client, { groupKeys = {} } = {}) {
    let enabled = true
    const getGroupKeyStore = mem((streamId) => GroupKeyStore({
        groupKeys: parseGroupKeys(groupKeys[streamId])
    }), {
        cacheKey([maybeStreamId]) {
            const { streamId } = validateOptions(maybeStreamId)
            return streamId
        }
    })
    let sub
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
    ], () => enabled)

    function rotateGroupKey(streamId) {
        if (!enabled) { return }
        const groupKeyStore = getGroupKeyStore(streamId)
        groupKeyStore.rotateGroupKey()
    }

    function setNextGroupKey(streamId, groupKey) {
        if (!enabled) { return }
        const groupKeyStore = getGroupKeyStore(streamId)

        groupKeyStore.setNextGroupKey(groupKey)
    }

    async function useGroupKey(streamId) {
        await next()
        if (!enabled) { return undefined }
        const groupKeyStore = getGroupKeyStore(streamId)

        return groupKeyStore.useGroupKey()
    }

    function hasAnyGroupKey(streamId) {
        const groupKeyStore = getGroupKeyStore(streamId)
        return !groupKeyStore.isEmpty()
    }

    async function rekey(streamId) {
        if (!enabled) { return }
        const groupKeyStore = getGroupKeyStore(streamId)
        groupKeyStore.rekey()
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
            enabled = false
            return next()
        }
    }
}

async function getGroupKeysFromStreamMessage(streamMessage, encryptionUtil) {
    const { encryptedGroupKeys } = GroupKeyResponse.fromArray(streamMessage.getParsedContent())
    return Promise.all(encryptedGroupKeys.map(async (encryptedGroupKey) => (
        new GroupKey(encryptedGroupKey.groupKeyId, await encryptionUtil.decryptWithPrivateKey(encryptedGroupKey.encryptedGroupKeyHex, true))
    )))
}

async function SubscriberKeyExhangeSubscription(client, getGroupKeyStore, encryptionUtil) {
    let sub
    async function onKeyExchangeMessage(_parsedContent, streamMessage) {
        try {
            const { messageType } = streamMessage
            const { MESSAGE_TYPES } = StreamMessage
            if (messageType !== MESSAGE_TYPES.GROUP_KEY_ANNOUNCE) {
                return
            }

            const groupKeys = await getGroupKeysFromStreamMessage(streamMessage, encryptionUtil)
            const groupKeyStore = getGroupKeyStore(streamMessage.getStreamId())
            groupKeys.forEach((groupKey) => {
                groupKeyStore.add(groupKey)
            })
        } catch (err) {
            sub.emit('error', err)
        }
    }

    sub = await subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
    sub.on('error', () => {}) // errors should not shut down subscription
    return sub
}

export function SubscriberKeyExchange(client, { groupKeys = {} } = {}) {
    let enabled = true
    const encryptionUtil = new EncryptionUtil(client.options.keyExchange)

    const getGroupKeyStore = mem((streamId) => GroupKeyStore({
        groupKeys: parseGroupKeys(groupKeys[streamId])
    }), {
        cacheKey([maybeStreamId]) {
            const { streamId } = validateOptions(maybeStreamId)
            return streamId
        }
    })

    let sub

    async function requestKeys({ streamId, publisherId, groupKeyIds }) {
        let done = false
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let responseTask
        let cancelTask
        let receivedGroupKeys = []
        let response
        const step = Scaffold([
            async () => {
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
                    cancelTask.resolve()
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
        ], () => enabled && !done, {
            id: `requestKeys.${requestId}`,
            onChange(isGoingUp) {
                if (!isGoingUp && cancelTask) {
                    cancelTask.resolve()
                }
            }
        })

        requestKeys.step = step
        await step()
        const keys = receivedGroupKeys.slice()
        done = true
        await step()
        return keys
    }

    const pending = new Map()
    const getBuffer = mem(() => [])
    const timeouts = {}

    async function getKey(streamMessage) {
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return Promise.resolve()
        }
        const groupKeyStore = getGroupKeyStore(streamId)
        if (groupKeyStore.has(groupKeyId)) {
            return groupKeyStore.get(groupKeyId)
        }

        if (pending.has(groupKeyId)) {
            return pending.get(groupKeyId)
        }

        const key = `${streamId}.${publisherId}`
        const buffer = getBuffer(key)
        buffer.push(groupKeyId)
        pending.set(groupKeyId, Defer())

        async function processBuffer() {
            const currentBuffer = getBuffer(key)
            const groupKeyIds = currentBuffer.slice()
            currentBuffer.length = 0
            try {
                const receivedGroupKeys = await requestKeys({
                    streamId,
                    publisherId,
                    groupKeyIds,
                })
                receivedGroupKeys.forEach((groupKey) => {
                    groupKeyStore.add(groupKey)
                })
                groupKeyIds.forEach((id) => {
                    if (!pending.has(id)) { return }
                    const groupKey = groupKeyStore.get(id)
                    const task = pending.get(id)
                    pending.delete(id)
                    task.resolve(groupKey)
                })
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

    const next = Scaffold([
        async () => {
            return encryptionUtil.onReady()
        },
        async () => {
            sub = await SubscriberKeyExhangeSubscription(client, getGroupKeyStore, encryptionUtil)
            return async () => {
                mem.clear(getGroupKeyStore)
                if (!sub) { return }
                const cancelTask = sub.cancel()
                sub = undefined
                await cancelTask
            }
        }
    ], () => enabled, {
        id: `SubscriberKeyExhangeSubscription.${client.id}`,
        async onDone() {
            // clean up requestKey
            if (requestKeys.step) {
                await requestKeys.step()
            }
        }
    })

    async function getGroupKey(streamMessage) {
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
        addNewKey(streamMessage) {
            if (!streamMessage.newGroupKey) { return }
            const streamId = streamMessage.getStreamId()
            const groupKeyStore = getGroupKeyStore(streamId)
            groupKeyStore.add(streamMessage.newGroupKey)
        },
        async stop() {
            enabled = false
            return next()
        }
    })
}
