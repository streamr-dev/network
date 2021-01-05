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

function getKeyExchangeStreamId(address) {
    if (isKeyExchangeStream(address)) {
        return address // prevent ever double-handling
    }
    return `${KEY_EXCHANGE_STREAM_PREFIX}/${address.toLowerCase()}`
}

function GroupKeyStore({ groupKeys }) {
    const store = new Map(groupKeys)

    let currentGroupKeyId // current key id if any
    let nextGroupKey // key to use next, disappears if not actually used.

    store.forEach((groupKey) => {
        GroupKey.validate(groupKey)
        // use last init key as current
        currentGroupKeyId = groupKey.id
    })

    function storeKey(groupKey) {
        GroupKey.validate(groupKey)
        if (store.has(groupKey.id)) {
            const existingKey = store.get(groupKey.id)
            if (!existingKey.equals(groupKey)) {
                throw new GroupKey.InvalidGroupKeyError(
                    `Trying to add groupKey ${groupKey.id} but key exists & is not equivalent to new GroupKey: ${groupKey}.`
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
        has(id) {
            if (currentGroupKeyId === id) { return true }

            if (nextGroupKey && nextGroupKey.id === id) { return true }

            return store.has(id)
        },
        isEmpty() {
            return !nextGroupKey && store.size === 0
        },
        useGroupKey() {
            if (nextGroupKey) {
                // next key becomes current key
                storeKey(nextGroupKey)

                currentGroupKeyId = nextGroupKey.id
                nextGroupKey = undefined
            }

            if (!currentGroupKeyId) {
                // generate & use key if none already set
                this.rotateGroupKey()
                return this.useGroupKey()
            }

            return store.get(currentGroupKeyId)
        },
        get(id) {
            return store.get(id)
        },
        clear() {
            currentGroupKeyId = undefined
            nextGroupKey = undefined
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
            nextGroupKey = newKey
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
    // eslint-disable-next-line promise/catch-or-return
    task.finally(() => {
        sub.off('message', onMessage)
        sub.off('error', task.reject)
    })
    return task
}

async function subscribeToKeyExchangeStream(client, onKeyExchangeMessage) {
    const { options } = client
    if ((!options.auth.privateKey && !options.auth.ethereum) || !options.keyExchange) {
        return Promise.resolve()
    }

    await client.session.getSessionToken() // trigger auth errors if any
    // subscribing to own keyexchange stream
    const publisherId = await client.getPublisherId()
    const streamId = getKeyExchangeStreamId(publisherId)
    return client.subscribe(streamId, onKeyExchangeMessage)
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
    async function onKeyExchangeMessage(parsedContent, streamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST) {
                return Promise.resolve()
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromArray(streamMessage.getParsedContent())

            const subscriberId = streamMessage.getPublisherId()

            const groupKeyStore = getGroupKeyStore(streamId)
            const encryptedGroupKeys = groupKeyIds.map((id) => {
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
                await cancelTask()
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

    return {
        setNextGroupKey,
        useGroupKey,
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
    async function onKeyExchangeMessage(parsedContent, streamMessage) {
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
                    cancelTask.resolve({})
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
                receivedGroupKeys = await getGroupKeysFromStreamMessage(response, encryptionUtil)

                return () => {
                    receivedGroupKeys = []
                }
            },
        ], () => enabled && !done, {
            onChange(isGoingUp) {
                if (!isGoingUp && cancelTask) {
                    cancelTask.resolve({})
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
                    const task = pending.get(id)
                    task.resolve(groupKeyStore.get(id))
                    pending.delete(id)
                })
            } catch (err) {
                groupKeyIds.forEach((id) => {
                    if (!pending.has(id)) { return }
                    const task = pending.get(id)
                    task.reject(err)
                    pending.delete(id)
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
            [sub] = await Promise.all([
                SubscriberKeyExhangeSubscription(client, getGroupKeyStore, encryptionUtil),
                encryptionUtil.onReady(),
            ])
            return async () => {
                mem.clear(getGroupKeyStore)
                if (!sub) { return }
                const cancelTask = sub.cancel()
                sub = undefined
                await cancelTask()
            }
        }
    ], () => enabled, {
        async onDone() {
            // clean up requestKey
            if (requestKeys.step) {
                await requestKeys.step()
            }
        }
    })

    async function getGroupKey(streamMessage) {
        if (!streamMessage.groupKeyId) { return undefined }
        await next()
        if (!enabled) { return undefined }

        return getKey(streamMessage)
    }

    return Object.assign(getGroupKey, {
        async start() {
            enabled = true
            return next()
        },
        async stop() {
            enabled = false
            return next()
        }
    })
}
