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

export class SubscriberKeyExchange {
    requestKeysStep?: () => Promise<void>
    client
    initialGroupKeys
    encryptionUtil
    pending = new Map<GroupKeyId, ReturnType<typeof Defer>>()
    getBuffer = mem<(groupKeyId: GroupKeyId) => GroupKeyId[], [string]>(() => [])
    timeouts: Record<string, ReturnType<typeof setTimeout>> = Object.create(null)
    next
    enabled = true
    sub?: Subscription

    constructor(client: StreamrClient, { groupKeys = {} }: KeyExhangeOptions = {}) {
        this.client = client
        this.initialGroupKeys = groupKeys
        this.getGroupKeyStore = pMemoize(this.getGroupKeyStore.bind(this), {
            cacheKey([maybeStreamId]) {
                const { streamId } = validateOptions(maybeStreamId)
                return streamId
            }
        })
        this.encryptionUtil = new EncryptionUtil(client.options.keyExchange)
        this.next = this.initNext()
    }

    async requestKeys({ streamId, publisherId, groupKeyIds }: {
        streamId: string,
        publisherId: string,
        groupKeyIds: GroupKeyId[]
    }) {
        let done = false
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = this.encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let responseTask: ReturnType<typeof Defer>
        let cancelTask: ReturnType<typeof Defer>
        let receivedGroupKeys: GroupKey[] = []
        let response: any

        this.requestKeysStep = Scaffold([
            async () => {
                if (!this.sub) { throw new Error('no subscription') }
                cancelTask = Defer()
                responseTask = waitForSubMessage(this.sub, (content, streamMessage) => {
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
                await this.client.publish(keyExchangeStreamId, msg)
            }, async () => {
                response = await responseTask
                return () => {
                    response = undefined
                }
            }, async () => {
                receivedGroupKeys = response ? await getGroupKeysFromStreamMessage(response, this.encryptionUtil) : []

                return () => {
                    receivedGroupKeys = []
                }
            },
        ], async () => this.enabled && !done, {
            id: `requestKeys.${requestId}`,
            onChange(isGoingUp) {
                if (!isGoingUp && cancelTask) {
                    cancelTask.resolve(undefined)
                }
            }
        })

        await this.requestKeysStep()
        const keys = receivedGroupKeys.slice()
        done = true
        await this.requestKeysStep()
        return keys
    }

    async getGroupKeyStore(streamId: string) {
        const clientId = await this.client.getAddress()
        return new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
        })
    }

    private async processBuffer({ streamId, publisherId }: { streamId: string, publisherId: string }) {
        if (!this.enabled) { return }
        const key = `${streamId}.${publisherId}`
        const currentBuffer = this.getBuffer(key)
        const groupKeyIds = currentBuffer.slice()
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        currentBuffer.length = 0
        try {
            const receivedGroupKeys = await this.requestKeys({
                streamId,
                publisherId,
                groupKeyIds,
            })
            if (!this.enabled) { return }
            await Promise.all(receivedGroupKeys.map(async (groupKey) => (
                groupKeyStore.add(groupKey)
            )))
            if (!this.enabled) { return }
            await Promise.all(groupKeyIds.map(async (id) => {
                if (!this.pending.has(id)) { return }
                const groupKeyTask = groupKeyStore.get(id)
                const task = this.pending.get(id)
                this.pending.delete(id)
                const groupKey = await groupKeyTask
                if (task) {
                    task.resolve(groupKey)
                }
            }))
        } catch (err) {
            groupKeyIds.forEach((id) => {
                if (!this.pending.has(id)) { return }
                const task = this.pending.get(id)
                this.pending.delete(id)
                if (task) {
                    task.reject(err)
                }
            })
        }
    }

    async getKey(streamMessage: StreamMessage) {
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return Promise.resolve()
        }

        const groupKeyStore = await this.getGroupKeyStore(streamId)

        if (!this.enabled) { return Promise.resolve() }
        const existingGroupKey = await groupKeyStore.get(groupKeyId)
        if (!this.enabled) { return Promise.resolve() }

        if (existingGroupKey) {
            return existingGroupKey
        }

        if (this.pending.has(groupKeyId)) {
            return this.pending.get(groupKeyId)
        }

        const key = `${streamId}.${publisherId}`
        const buffer = this.getBuffer(key)
        buffer.push(groupKeyId)
        this.pending.set(groupKeyId, Defer())

        if (!this.timeouts[key]) {
            this.timeouts[key] = setTimeout(() => {
                delete this.timeouts[key]
                this.processBuffer({ streamId, publisherId })
            }, 1000)
        }

        return this.pending.get(groupKeyId)
    }

    cleanupPending() {
        Array.from(Object.entries(this.timeouts)).forEach(([key, value]) => {
            clearTimeout(value)
            delete this.timeouts[key]
        })
        const pendingValues = Array.from(this.pending.values())
        this.pending.clear()
        pendingValues.forEach((value) => {
            value.resolve(undefined)
        })
        pMemoize.clear(this.getGroupKeyStore)
    }

    initNext() {
        return Scaffold([
            async () => {
                await this.encryptionUtil.onReady()
            },
            async () => {
                this.sub = await SubscriberKeyExhangeSubscription(this.client, this.getGroupKeyStore, this.encryptionUtil)
                return async () => {
                    if (!this.sub) { return }
                    const cancelTask = this.sub.cancel()
                    this.sub = undefined
                    await cancelTask
                }
            }
        ], async () => this.enabled, {
            id: `SubscriberKeyExhangeSubscription.${this.client.id}`,
            onChange: (shouldUp) => {
                if (!shouldUp) {
                    this.cleanupPending()
                }
            },
            onDone: async () => {
                // clean up requestKey
                if (this.requestKeysStep) {
                    await this.requestKeysStep()
                }
            }
        })
    }

    async getGroupKey(streamMessage: StreamMessage) {
        if (!streamMessage.groupKeyId) { return [] }
        await this.next()
        if (!this.enabled) { return [] }

        return this.getKey(streamMessage)
    }

    async start() {
        this.enabled = true
        return this.next()
    }

    async addNewKey(streamMessage: StreamMessage) {
        if (!streamMessage.newGroupKey) { return }
        const streamId = streamMessage.getStreamId()
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        // newGroupKey has been converted into GroupKey
        const groupKey: unknown = streamMessage.newGroupKey
        await groupKeyStore.add(groupKey as GroupKey)
    }

    async stop() {
        this.enabled = false
        return this.next()
    }
}
