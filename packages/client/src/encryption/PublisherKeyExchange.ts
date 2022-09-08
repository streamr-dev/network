import {
    StreamMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    EncryptedGroupKey,
    StreamID,
    EthereumAddress,
    GroupKeyRequestSerialized,
} from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { instanceId } from '../utils/utils'
import { pOnce } from '../utils/promises'
import { Context } from '../utils/Context'
import { Publisher } from '../publish/Publisher'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'

import { GroupKey } from './GroupKey'
import { EncryptionUtil } from './EncryptionUtil'
import { KeyExchangeStream } from './KeyExchangeStream'

import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { Subscription } from '../subscribe/Subscription'
import { GroupKeyStore } from './GroupKeyStore'
import { Debugger } from '../utils/log'

export const createGroupKeyResponse = async (
    streamMessage: StreamMessage<GroupKeyRequestSerialized>,
    getGroupKey: (groupKeyId: string, streamId: StreamID) => Promise<GroupKey | undefined>,
    isStreamSubscriber: (streamId: StreamID, ethAddress: EthereumAddress) => Promise<boolean>,
    debug?: Debugger
): Promise<GroupKeyResponse> => {
    const request = GroupKeyRequest.fromArray(streamMessage.getParsedContent())
    const subscriberId = streamMessage.getPublisherId()
    // No need to check if parsedContent contains the necessary fields because it was already checked during deserialization
    const { requestId, streamId, rsaPublicKey, groupKeyIds } = request

    const isSubscriber = await isStreamSubscriber(streamId, subscriberId)

    const encryptedGroupKeys = (!isSubscriber ? [] : await Promise.all(groupKeyIds.map(async (id) => {
        const groupKey = await getGroupKey(id, streamId)
        if (!groupKey) {
            return null // will be filtered out
        }
        const key = EncryptionUtil.encryptWithRSAPublicKey(groupKey.data, rsaPublicKey, true)
        return new EncryptedGroupKey(id, key)
    }))).filter((item) => item !== null) as EncryptedGroupKey[]

    debug?.('Subscriber requested groupKeys: %d. Got: %d. %o', groupKeyIds.length, encryptedGroupKeys.length, {
        subscriberId,
        groupKeyIds,
        responseKeys: encryptedGroupKeys.map(({ groupKeyId }) => groupKeyId),
    })

    return new GroupKeyResponse({
        streamId,
        requestId,
        encryptedGroupKeys,
    })
}

@scoped(Lifecycle.ContainerScoped)
export class PublisherKeyExchange implements Context {
    private enabled = true
    readonly id
    readonly debug
    private getSubscription: (() => Promise<Subscription<unknown> | undefined>) & { reset(): void, isStarted(): boolean }

    constructor(
        @inject(delay(() => Publisher)) private publisher: Publisher,
        private groupKeyStoreFactory: GroupKeyStoreFactory,
        private streamRegistryCached: StreamRegistryCached,
        @inject(delay(() => KeyExchangeStream)) private keyExchangeStream: KeyExchangeStream,
    ) {
        this.id = instanceId(this)
        this.debug = this.publisher.debug.extend(this.id)
        const getSubscription = pOnce(this.subscribe.bind(this))
        this.getSubscription = getSubscription
        this.onKeyExchangeMessage = this.onKeyExchangeMessage.bind(this)
    }

    private async onKeyExchangeMessage(streamMessage?: StreamMessage): Promise<void> {
        if (!streamMessage) { return }

        if (!GroupKeyRequest.is(streamMessage)) {
            return
        }

        const response = await createGroupKeyResponse(
            streamMessage,
            async (groupKeyId: string, streamId: StreamID) => {
                const store = await this.groupKeyStoreFactory.getStore(streamId)
                return store.get(groupKeyId)
            },
            (streamId: StreamID, address: EthereumAddress) => this.streamRegistryCached.isStreamSubscriber(streamId, address),
            this.debug
        )

        const subscriberId = streamMessage.getPublisherId()
        await this.keyExchangeStream.response(subscriberId, response)
    }

    private async subscribe(): Promise<Subscription<unknown> | undefined> {
        if (!this.enabled) { return undefined }
        const sub = await this.keyExchangeStream.subscribe()
        if (!sub) { return undefined }

        if (!this.enabled) {
            await sub.unsubscribe()
            return undefined
        }

        sub.consume(this.onKeyExchangeMessage).catch(() => {})

        return sub
    }

    private async getGroupKeyStore(streamId: StreamID): Promise<GroupKeyStore> {
        return this.groupKeyStoreFactory.getStore(streamId)
    }

    async useGroupKey(streamId: StreamID): Promise<never[] | [GroupKey | undefined, GroupKey | undefined]> {
        await this.getSubscription()
        if (!this.enabled) { return [] }
        const groupKeyStore = await this.getGroupKeyStore(streamId)
        if (!this.enabled) { return [] }
        return groupKeyStore.useGroupKey()
    }
}
