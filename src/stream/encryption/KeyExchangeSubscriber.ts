import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse
} from 'streamr-client-protocol'
import pMemoize from 'p-memoize'
import { uuid, Defer } from '../../utils'
import Scaffold from '../../utils/Scaffold'
import mem from 'mem'

import { validateOptions } from '../utils'
import EncryptionUtil, { GroupKey } from './Encryption'
import type { Subscription } from '../../subscribe'
import { StreamrClient } from '../../StreamrClient'
import GroupKeyStore from './GroupKeyStore'
import {
    GroupKeyId,
    subscribeToKeyExchangeStream,
    parseGroupKeys,
    getKeyExchangeStreamId,
    KeyExhangeOptions,
} from './KeyExchangeUtils'

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
    getGroupKeyStore: (streamId: string) => Promise<GroupKeyStore>,
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
            // newGroupKey has been converted into GroupKey
            const { newGroupKey } = streamMessage
            await groupKeyStore.add(newGroupKey as GroupKey)
        },
        async stop() {
            enabled = false
            return next()
        }
    })
}
