import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse
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
    KeyExhangeOptions,
} from './KeyExchangeUtils'

type MessageMatch = (content: any, streamMessage: StreamMessage) => boolean

function waitForSubMessage(sub: Subscription, matchFn: MessageMatch) {
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

async function getGroupKeysFromStreamMessage(streamMessage: StreamMessage, encryptionUtil: EncryptionUtil) {
    const content = streamMessage.getParsedContent() || []
    if (content.length === 2) {
        content.unshift('') // Java client doesn't inject request id, skip as not needed.
    }
    const { encryptedGroupKeys = [] } = GroupKeyResponse.fromArray(content)
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
    enabled = true

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
    }

    async getSubscription() {
        return SubscriberKeyExhangeSubscription(this.client, this.getGroupKeyStore, this.encryptionUtil)
    }

    async requestKeys({ streamId, publisherId, groupKeyIds }: {
        streamId: string,
        publisherId: string,
        groupKeyIds: GroupKeyId[]
    }) {
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = this.encryptionUtil.getPublicKey()
        const keyExchangeStreamId = getKeyExchangeStreamId(publisherId)
        let sub!: Subscription
        let responseTask
        try {
            sub = await this.getSubscription()
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

    async getGroupKeyStore(streamId: string) {
        const clientId = await this.client.getAddress()
        return new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
        })
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

        const receivedGroupKeys = await this.requestKeys({
            streamId,
            publisherId,
            groupKeyIds: [groupKeyId],
        })

        await Promise.all(receivedGroupKeys.map(async (groupKey: GroupKey) => (
            groupKeyStore.add(groupKey)
        )))

        return groupKeyStore.get(groupKeyId)
    }

    cleanupPending() {
        pMemoize.clear(this.getGroupKeyStore)
    }

    async getGroupKey(streamMessage: StreamMessage) {
        if (!streamMessage.groupKeyId) { return [] }
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
