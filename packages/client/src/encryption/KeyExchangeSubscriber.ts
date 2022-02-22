import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyAnnounce, StreamID
} from 'streamr-client-protocol'

import { uuid, instanceId } from '../utils'
import { Context } from '../utils/Context'
import Subscriber from '../subscribe/Subscriber'

import {
    GroupKeyId,
    KeyExchangeStream,
} from './KeyExchangeUtils'

import EncryptionUtil, { GroupKey } from './Encryption'
import GroupKeyStoreFactory from './GroupKeyStoreFactory'
import { Lifecycle, scoped } from 'tsyringe'

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

@scoped(Lifecycle.ContainerScoped)
export class SubscriberKeyExchange implements Context {
    readonly id
    readonly debug
    encryptionUtil
    isStopped = false

    constructor(
        private subscriber: Subscriber,
        private keyExchangeStream: KeyExchangeStream,
        private groupKeyStoreFactory: GroupKeyStoreFactory,
    ) {
        this.id = instanceId(this)
        this.debug = this.subscriber.debug.extend(this.id)
        this.encryptionUtil = new EncryptionUtil()
    }

    async requestKeys({ streamId, publisherId, groupKeyIds }: {
        streamId: StreamID,
        publisherId: string,
        groupKeyIds: GroupKeyId[]
    }): Promise<GroupKey[]> {
        if (this.isStopped) { return [] }
        const requestId = uuid('GroupKeyRequest')
        const rsaPublicKey = this.encryptionUtil.getPublicKey()
        const msg = new GroupKeyRequest({
            streamId,
            requestId,
            rsaPublicKey,
            groupKeyIds,
        })
        const response = await this.keyExchangeStream.request(publisherId, msg)
        return response ? getGroupKeysFromStreamMessage(response, this.encryptionUtil) : []
    }

    stop() {
        this.isStopped = true
    }

    async getGroupKeyStore(streamId: StreamID) {
        return this.groupKeyStoreFactory.getStore(streamId)
    }

    async getKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        if (this.isStopped) { return undefined }
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return undefined
        }

        const groupKeyStore = await this.getGroupKeyStore(streamId)

        if (this.isStopped) { return undefined }
        const existingGroupKey = await groupKeyStore.get(groupKeyId)
        if (this.isStopped) { return undefined }

        if (existingGroupKey) {
            return existingGroupKey
        }

        const receivedGroupKeys = await this.requestKeys({
            streamId,
            publisherId,
            groupKeyIds: [groupKeyId],
        })

        if (this.isStopped) { return undefined }
        await Promise.all(receivedGroupKeys.map(async (groupKey: GroupKey) => (
            groupKeyStore.add(groupKey)
        )))

        if (this.isStopped) { return undefined }
        return receivedGroupKeys.find((groupKey) => groupKey.id === groupKeyId)
    }

    async getGroupKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        if (this.isStopped) { return undefined }

        if (!streamMessage.groupKeyId) { return undefined }
        await this.encryptionUtil.onReady()

        if (this.isStopped) { return undefined }
        return this.getKey(streamMessage)
    }

    async addNewKey(streamMessage: StreamMessage) {
        if (this.isStopped) { return }

        if (!streamMessage.newGroupKey) { return }
        const streamId = streamMessage.getStreamId()
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (this.isStopped) { return }
        // newGroupKey has been converted into GroupKey
        const groupKey: unknown = streamMessage.newGroupKey
        await groupKeyStore.add(groupKey as GroupKey)
    }
}
