import { MessageLayer } from 'streamr-client-protocol'

import { uuid, Defer } from '../utils'
import Scaffold from '../utils/Scaffold'

import { waitForMatchingMessage, STREAM_MESSAGE_TYPES } from './utils'
import EncryptionUtil, { GroupKey } from './Encryption'

const { StreamMessage, GroupKeyRequest, GroupKeyResponse, GroupKeyErrorResponse } = MessageLayer

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

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
        this.code = 'INVALID_CONTENT_TYPE'
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}
*/

function getKeyExchangeStreamId(address) {
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
            const existingKey = store.has(groupKey.id)
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
            if (streamMessage.contentType !== StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST) {
                return Promise.resolve()
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = streamMessage.getParsedContent()

            const subscriberId = streamMessage.getPublisherId()

            const encryptedGroupKeys = groupKeyIds.map((id) => {
                const groupKey = groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }

                return EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true)
            }).filter(Boolean)

            return client.publish(getKeyExchangeStreamId(subscriberId), new GroupKeyResponse({
                streamId,
                requestId,
                encryptedGroupKeys,
            }))
        })
    }

    return subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
}

function SubscriberKeyExhangeSubscription(client, groupKeyStore) {
    async function onKeyExchangeMessage(parsedContent, streamMessage) {
        return catchKeyExchangeError(client, streamMessage, async () => {
            const { contentType } = streamMessage
            const { CONTENT_TYPES } = StreamMessage
            if (contentType !== CONTENT_TYPES.GROUP_KEY_RESPONSE && contentType !== CONTENT_TYPES.GROUP_KEY_ERROR_RESPONSE) {
                return
            }

            // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
            const { requestId, streamId, rsaPublicKey, groupKeyIds } = streamMessage.getParsedContent()

            const subscriberId = streamMessage.getPublisherId()

            const encryptedGroupKeys = groupKeyIds.map((id) => {
                const groupKey = groupKeyStore.get(id)
                if (!groupKey) {
                    return null // will be filtered out
                }

                return EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true)
            }).filter(Boolean)

            await client.publish(getKeyExchangeStreamId(subscriberId), {
                content: new GroupKeyResponse({
                    streamId,
                    requestId,
                    encryptedGroupKeys,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
                })
            })
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

    async function requestKey(streamMessage) {
        client.debug('requesting key...', streamMessage.groupKeyId)
        const requestId = uuid('GroupKeyRequest')
        const streamId = streamMessage.getStreamId()
        const rsaPublicKey = encryptionUtil.getPublicKey()
        const publisherId = streamMessage.getPublisherId().toLowerCase()
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
                        return res.streamMessage.messageType === StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE
                    },
                })
                return () => {
                    cancelTask.resolve({})
                }
            }, async () => {
                await client.publish(keyExchangeStreamId, {
                    content: new GroupKeyRequest({
                        streamId,
                        requestId,
                        rsaPublicKey,
                        groupKeyIds: [streamMessage.groupKeyId],
                    })
                })
            }, async () => {
                response = await responseTask
                return () => {
                    response = undefined
                }
            }, async () => {
                if (response && !response.encryptedGroupKeys) { return () => {} }

                receivedGroupKeys = await Promise.all(encryptedGroupKeys.map((encryptedGroupKeyObj) => (
                    encryptionUtil.decryptWithPrivateKey(encryptedGroupKeyObj.encryptedGroupKeyHex, true)
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

        requestKey.step = step
        await step()
        return receivedGroupKeys
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
            if (requestKey.step) {
                await requestKey.step()
            }
        }
    })

    async function getGroupKey(streamMessage) {
        if (!streamMessage.groupKeyId) { return undefined }
        await next()
        if (!enabled) { return undefined }

        if (!groupKeyStore.has(streamMessage.groupKeyId)) {
            const receivedGroupKeys = await requestKey(streamMessage)
            if (!enabled) { return undefined }
            receivedGroupKeys.forEach((groupKey) => {
                groupKeyStore.set(groupKey.id, groupKey)
            })
        }

        return groupKeyStore.get(streamMessage.groupKeyId)
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
