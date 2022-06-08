import {
    StreamMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    EncryptedGroupKey,
    GroupKeyErrorResponse,
    ValidationError,
    StreamID,
    EthereumAddress,
    GroupKeyRequestSerialized
} from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { pOnce, instanceId } from '../utils'
import { Context } from '../utils/Context'
import { Publisher } from '../publish/Publisher'
import { GroupKeyStoreFactory } from './GroupKeyStoreFactory'

import { GroupKey } from './GroupKey'
import { EncryptionUtil, StreamMessageProcessingError } from './EncryptionUtil'
import { KeyExchangeStream } from './KeyExchangeStream'

import { StreamRegistryCached } from '../StreamRegistryCached'
import { Subscription } from '../subscribe/Subscription'
import { GroupKeyStore } from './GroupKeyStore'
import { Debugger } from '../utils/log'

class InvalidGroupKeyRequestError extends ValidationError {
    constructor(msg: string) {
        super(msg, 'INVALID_GROUP_KEY_REQUEST')
    }
}

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
        const key = EncryptionUtil.encryptWithPublicKey(groupKey.data, rsaPublicKey, true)
        return new EncryptedGroupKey(id, key)
    }))).filter(Boolean) as EncryptedGroupKey[]

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

    private getWrapError(
        streamMessage: StreamMessage
    ): (error: ValidationError) => Promise<StreamMessage<GroupKeyResponse | GroupKeyErrorResponse> | undefined> {
        return async (error: ValidationError) => {
            try {
                const subscriberId = streamMessage.getPublisherId()
                if (!GroupKeyRequest.is(streamMessage)) {
                    // ignore weird message
                    return undefined
                }

                const msg = streamMessage.getParsedContent()
                const { streamId, requestId, groupKeyIds } = GroupKeyRequest.fromArray(msg)
                const response = new GroupKeyErrorResponse({
                    requestId,
                    streamId,
                    errorCode: error.code ?? 'UNEXPECTED_ERROR',
                    errorMessage: error.message,
                    groupKeyIds
                })
                return await this.keyExchangeStream.response(subscriberId, response)
            } catch (err) {
                this.debug('unexpected error responding with error', err)
                return undefined
            }
        }
    }

    private async onKeyExchangeMessage(streamMessage?: StreamMessage): Promise<void> {
        if (!streamMessage) { return }
        const wrapError = this.getWrapError(streamMessage)
        try {
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
        } catch (err: any) {
            if (!('streamMessage' in err)) {
                this.debug('unexpected', err)
                return // do nothing, supress.
            }

            await wrapError(err)
        }
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
        sub.onError.listen(async (err: Error | StreamMessageProcessingError) => {
            if (!('streamMessage' in err)) {
                this.debug('unexpected', err)
                return // do nothing, supress.
            }

            // eslint-disable-next-line promise/no-promise-in-callback
            await this.getWrapError(err.streamMessage)(new InvalidGroupKeyRequestError(err.message)).catch((error) => {
                this.debug('unexpected error sending error', error)
            })

        })

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
