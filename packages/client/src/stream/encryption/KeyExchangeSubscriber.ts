import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyAnnounce
} from 'streamr-client-protocol'
import pMemoize from 'p-memoize'
import { uuid, Defer } from '../../utils'

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
    KeyExchangeOptions,
} from './KeyExchangeUtils'

type MessageMatch = (content: any, streamMessage: StreamMessage) => boolean

const { MESSAGE_TYPES } = StreamMessage

function waitForSubMessage(sub: Subscription, matchFn: MessageMatch): ReturnType<typeof Defer> & Promise<StreamMessage | undefined> {
    const task = Defer<StreamMessage | undefined>()
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

async function getGroupKeysFromStreamMessage(streamMessage: StreamMessage, encryptionUtil: EncryptionUtil): Promise<GroupKey[]> {
    let encryptedGroupKeys: EncryptedGroupKey[] = []
    if (GroupKeyResponse.is(streamMessage)) {
        encryptedGroupKeys = GroupKeyResponse.fromArray(streamMessage.getParsedContent() || []).encryptedGroupKeys || []
    } else if (GroupKeyAnnounce.is(streamMessage)) {
        const msg = GroupKeyAnnounce.fromArray(streamMessage.getParsedContent() || [])
        encryptedGroupKeys = msg.encryptedGroupKeys || []
    }

    const tasks = encryptedGroupKeys.map(async (encryptedGroupKey) => (
        new GroupKey(
            encryptedGroupKey.groupKeyId,
            await encryptionUtil.decryptWithPrivateKey(encryptedGroupKey.encryptedGroupKeyHex, true)
        )
    ))
    await Promise.allSettled(tasks)
    return Promise.all(tasks)
}

async function SubscriberKeyExchangeSubscription(
    client: StreamrClient,
    getGroupKeyStore: (streamId: string) => Promise<GroupKeyStore>,
    encryptionUtil: EncryptionUtil
): Promise<Subscription | undefined> {
    let sub: Subscription | void
    async function onKeyExchangeMessage(_parsedContent: any, streamMessage: StreamMessage) {
        try {
            const { messageType } = streamMessage
            if (messageType !== MESSAGE_TYPES.GROUP_KEY_ANNOUNCE) {
                return
            }

            const groupKeys = await getGroupKeysFromStreamMessage(streamMessage, encryptionUtil)
            const groupKeyStore = await getGroupKeyStore(streamMessage.getStreamId())
            await Promise.all(groupKeys.map(async (groupKey) => (
                groupKeyStore.add(groupKey)
            )))
        } catch (err) {
            if (!sub) { return }
            sub.emit('error', err)
        }
    }

    sub = await subscribeToKeyExchangeStream(client, onKeyExchangeMessage)
    if (!sub) { return undefined }

    sub.on('error', () => {}) // errors should not shut down subscription
    return sub
}

export class SubscriberKeyExchange {
    requestKeysStep?: () => Promise<void>
    client
    initialGroupKeys
    encryptionUtil
    enabled = true

    constructor(client: StreamrClient, { groupKeys = {} }: KeyExchangeOptions = {}) {
        this.client = client
        this.initialGroupKeys = groupKeys
        this.getGroupKeyStore = pMemoize(this.getGroupKeyStore.bind(this), {
            cacheKey([maybeStreamId]) {
                const { streamId } = validateOptions(maybeStreamId)
                return streamId
            }
        })
        this.encryptionUtil = new EncryptionUtil(client.options.keyExchange)
    }

    async getSubscription() {
        return SubscriberKeyExchangeSubscription(this.client, this.getGroupKeyStore, this.encryptionUtil)
    }

    async requestKeys({ streamId, publisherId, groupKeyIds }: {
        streamId: string,
        publisherId: string,
        groupKeyIds: GroupKeyId[]
    }): Promise<GroupKey[]> {
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = this.encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let sub: Subscription | void
        let responseTask
        try {
            sub = await this.getSubscription()
            if (!sub) { return [] }
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

            const msg = new GroupKeyRequest({
                streamId,
                requestId,
                rsaPublicKey,
                groupKeyIds,
            })
            await this.client.publish(keyExchangeStreamId, msg)
            const response = await responseTask
            return response ? await getGroupKeysFromStreamMessage(response, this.encryptionUtil) : []
        } finally {
            await responseTask
            if (sub) {
                await sub.unsubscribe()
            }
        }
    }

    async getGroupKeyStore(streamId: string): Promise<GroupKeyStore> {
        const clientId = await this.client.getAddress()
        return new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
        })
    }

    async getKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return undefined
        }

        const groupKeyStore = await this.getGroupKeyStore(streamId)

        if (!this.enabled) { return undefined }
        const existingGroupKey = await groupKeyStore.get(groupKeyId)
        if (!this.enabled) { return undefined }

        if (existingGroupKey) {
            return existingGroupKey
        }

        const receivedGroupKeys = await this.requestKeys({
            streamId,
            publisherId,
            groupKeyIds: [groupKeyId],
        })

        if (!this.enabled) { return undefined }
        await Promise.all(receivedGroupKeys.map(async (groupKey: GroupKey) => (
            groupKeyStore.add(groupKey)
        )))

        if (!this.enabled) { return undefined }
        return receivedGroupKeys.find((groupKey) => groupKey.id === groupKeyId)
    }

    cleanupPending() {
        pMemoize.clear(this.getGroupKeyStore)
    }

    async getGroupKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        if (!streamMessage.groupKeyId) { return undefined }
        await this.encryptionUtil.onReady()

        return this.getKey(streamMessage)
    }

    async start() {
        this.enabled = true
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
    }
}
