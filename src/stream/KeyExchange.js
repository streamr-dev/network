import { MessageLayer } from 'streamr-client-protocol'
import mem from 'mem'

import { uuid, Defer } from '../utils'
import Scaffold from '../utils/Scaffold'

import { waitForMatchingMessage, STREAM_MESSAGE_TYPES } from './utils'
import EncryptionUtil, { GroupKey } from './Encryption'

const {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, GroupKeyErrorResponse, EncryptedGroupKey
} = MessageLayer

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

export function isKeyExchangeStream(id = '') {
    return id.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

/*
class InvalidGroupKeyRequestError extends Error {
    constructor(...args) {
        super(...args)
        this.code = 'INVALID_GROUP_KEY_REQUEST'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

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
                throw GroupKey.InvalidGroupKeyError(`Trying to add groupKey but key exists & is not equivalent to new GroupKey: ${groupKey}.`)
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
            return nextGroupKey || store.size !== 0
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

async function subscribeToKeyExchangeStream(client, onKeyExchangeMessage) {
    const { options } = client
    if ((!options.auth.privateKey && !options.auth.provider) || !options.keyExchange) {
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
        client.debug('WARN: %o', error)

        const subscriberId = streamMessage.getPublisherId()
        const msg = streamMessage.getParsedContent()
        const { streamId, requestId, groupKeyIds } = msg
        return client.publish(getKeyExchangeStreamId(subscriberId), new GroupKeyErrorResponse({
            requestId,
            streamId,
            errorCode: error.code || 'UNEXPECTED_ERROR',
            errorMessage: error.message,
            groupKeyIds
        }))
    }
}

function PublisherKeyExhangeSubscription(client, groupKeyStore) {
    async function onKeyExchangeMessage(parsedContent, streamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST) {
                return Promise.resolve()
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = GroupKeyRequest.fromArray(streamMessage.getParsedContent())

            const subscriberId = streamMessage.getPublisherId()

            const encryptedGroupKeys = groupKeyIds.map((id) => {
                const groupKey = groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }

                return new EncryptedGroupKey(id, EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true))
            }).filter(Boolean)
            return client.publish(getKeyExchangeStreamId(subscriberId), new GroupKeyResponse({
                streamId,
                requestId,
                encryptedGroupKeys,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            }))
        })
    }

    return subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
}

function SubscriberKeyExhangeSubscription(client, groupKeyStore) {
    async function onKeyExchangeMessage(parsedContent, streamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            // TODO match key announce
        })
    }

    return subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
}

export function PublisherKeyExhange(client, { groupKeys } = {}) {
    let enabled = true
    const groupKeyStore = GroupKeyStore({
        groupKeys,
    })
    let sub
    const next = Scaffold([
        async () => {
            sub = await PublisherKeyExhangeSubscription(client, groupKeyStore)
            return async () => {
                groupKeyStore.clear()
                if (!sub) { return }
                const cancelTask = sub.cancel()
                sub = undefined
                await cancelTask()
            }
        }
    ], () => enabled)

    function rotateGroupKey() {
        if (!enabled) { return }

        groupKeyStore.rotateGroupKey()
    }

    function setNextGroupKey(groupKey) {
        if (!enabled) { return }

        groupKeyStore.setNextGroupKey(groupKey)
    }

    async function useGroupKey() {
        await next()
        if (!enabled) { return undefined }

        return groupKeyStore.useGroupKey()
    }

    return {
        setNextGroupKey,
        useGroupKey,
        hasAnyGroupKey() {
            return !groupKeyStore.isEmpty()
        },
        rotateGroupKey,
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

export function SubscriberKeyExchange(client, { groupKeys } = {}) {
    let enabled = true
    const encryptionUtil = new EncryptionUtil(client.options.keyExchange)
    const groupKeyStore = GroupKeyStore({
        groupKeys,
    })

    let sub

    async function requestKeys({ streamId, publisherId, groupKeyIds }) {
        client.debug('requestKeys', {
            streamId, publisherId, groupKeyIds,
        })

        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let responseTask
        let cancelTask
        let receivedGroupKeys = []
        let encryptedGroupKeys
        let response
        const step = Scaffold([
            async () => {
                cancelTask = Defer()
                responseTask = waitForMatchingMessage({
                    connection: client.connection,
                    types: STREAM_MESSAGE_TYPES,
                    cancelTask,
                    matchFn(res) {
                        const { messageType } = res.streamMessage
                        return (
                            messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
                            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
                        )
                    },
                })
                return () => {
                    cancelTask.resolve({})
                }
            }, async () => {
                await client.publish(keyExchangeStreamId, new GroupKeyRequest({
                    streamId,
                    requestId,
                    rsaPublicKey,
                    groupKeyIds,
                }))
            }, async () => {
                response = await responseTask
                return () => {
                    response = undefined
                }
            }, async () => {
                encryptedGroupKeys = GroupKeyResponse.fromArray(response.streamMessage.getParsedContent()).encryptedGroupKeys

                receivedGroupKeys = await Promise.all(encryptedGroupKeys.map(async (encryptedGroupKeyObj, i) => (
                    new GroupKey(groupKeyIds[i], await encryptionUtil.decryptWithPrivateKey(encryptedGroupKeyObj.encryptedGroupKeyHex, true))
                )))

                return () => {
                    receivedGroupKeys = []
                }
            },
        ], () => enabled, {
            onChange(isGoingUp) {
                if (!isGoingUp && cancelTask) {
                    cancelTask.resolve({})
                }
            }
        })

        requestKeys.step = step
        await step()
        return receivedGroupKeys
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
        if (!timeouts[key]) {
            timeouts[key] = setTimeout(async () => {
                delete timeouts[key]
                const currentBuffer = getBuffer(key)
                const groupKeyIds = currentBuffer.slice()
                currentBuffer.length = 0
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
            }, 1000)
        }

        return pending.get(groupKeyId)
    }

    const next = Scaffold([
        async () => {
            [sub] = await Promise.all([
                SubscriberKeyExhangeSubscription(client, groupKeyStore),
                encryptionUtil.onReady(),
            ])
            return async () => {
                groupKeyStore.clear()
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
