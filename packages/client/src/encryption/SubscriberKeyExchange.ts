import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, EncryptedGroupKey, GroupKeyAnnounce, StreamID
} from 'streamr-client-protocol'

import { uuid, instanceId } from '../utils'
import { Context } from '../utils/Context'
import { Subscriber } from '../subscribe/Subscriber'

import {
    GroupKeyId,
    KeyExchangeStream,
} from './KeyExchangeStream'

import { GroupKey } from './GroupKey'
import { EncryptionUtil } from './EncryptionUtil'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'
import { Lifecycle, scoped } from 'tsyringe'
import { GroupKeyStore } from './GroupKeyStore'

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

    async getGroupKeyStore(streamId: StreamID): Promise<GroupKeyStore> {
        return this.groupKeyStoreFactory.getStore(streamId)
    }

    async getKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        const streamId = streamMessage.getStreamId()
        const publisherId = streamMessage.getPublisherId()
        const { groupKeyId } = streamMessage
        if (!groupKeyId) {
            return undefined
        }

        const groupKeyStore = await this.getGroupKeyStore(streamId)

        const existingGroupKey = await groupKeyStore.get(groupKeyId)

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

        return receivedGroupKeys.find((groupKey) => groupKey.id === groupKeyId)
    }

    async getGroupKey(streamMessage: StreamMessage): Promise<GroupKey | undefined> {
        if (!streamMessage.groupKeyId) { return undefined }
        await this.encryptionUtil.onReady()
        return this.getKey(streamMessage)
    }

    async addNewKey(streamMessage: StreamMessage): Promise<void> {
        if (!streamMessage.newGroupKey) { return }
        const streamId = streamMessage.getStreamId()
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        // newGroupKey has been converted into GroupKey
        const groupKey: unknown = streamMessage.newGroupKey
        await groupKeyStore.add(groupKey as GroupKey)
    }
}
