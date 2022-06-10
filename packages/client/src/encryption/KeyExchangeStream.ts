import {
    StreamMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyErrorResponse,
    EthereumAddress,
    KeyExchangeStreamIDUtils
} from 'streamr-client-protocol'
import { Lifecycle, scoped, delay, inject } from 'tsyringe'

import { pOnce, instanceId } from '../utils'
import { Context } from '../utils/Context'
import { DestroySignal } from '../DestroySignal'

import { Subscriber } from '../subscribe/Subscriber'
import { Publisher } from '../publish/Publisher'
import { Subscription } from '../subscribe/Subscription'
import { Ethereum } from '../Ethereum'

import { GroupKey, GroupKeyish } from './GroupKey'
import { publishAndWaitForResponseMessage } from '../utils/waitForMessage'

export type GroupKeyId = string
export type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

export type EncryptionConfig = {
    encryptionKeys: Record<string, GroupKeysSerialized>
}

export function parseGroupKeys(groupKeys: GroupKeysSerialized = {}): Map<GroupKeyId, GroupKey> {
    return new Map<GroupKeyId, GroupKey>(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean) as [])
}

const { GROUP_KEY_RESPONSE, GROUP_KEY_ERROR_RESPONSE } = StreamMessage.MESSAGE_TYPES

@scoped(Lifecycle.ContainerScoped)
export class KeyExchangeStream implements Context {
    readonly id
    readonly debug
    public subscribe: (() => Promise<Subscription<unknown>>) & { reset(): void }
    
    constructor(
        context: Context,
        private ethereum: Ethereum,
        private subscriber: Subscriber,
        private destroySignal: DestroySignal,
        @inject(delay(() => Publisher)) private publisher: Publisher
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.subscribe = pOnce(this.createSubscription.bind(this))
    }

    private async createSubscription(): Promise<Subscription<unknown>> {
        // subscribing to own keyexchange stream
        const publisherId = await this.ethereum.getAddress()
        const streamPartId = KeyExchangeStreamIDUtils.formStreamPartID(publisherId)
        const sub = await this.subscriber.subscribe(streamPartId)
        const onDestroy = () => {
            return sub.unsubscribe()
        }
        this.destroySignal.onDestroy.listen(onDestroy)
        sub.onBeforeFinally.listen(() => {
            this.destroySignal.onDestroy.unlisten(onDestroy)
            this.subscribe.reset()
        })
        return sub
    }

    async request(publisherId: EthereumAddress, request: GroupKeyRequest): Promise<StreamMessage<unknown> | undefined> {
        const streamPartId = KeyExchangeStreamIDUtils.formStreamPartID(publisherId)

        const matchFn = (streamMessage: StreamMessage) => {
            const { messageType } = streamMessage
            if (messageType !== GROUP_KEY_RESPONSE && messageType !== GROUP_KEY_ERROR_RESPONSE) {
                return false
            }
            const content = streamMessage.getContent() as any
            const [ requestId ] = content
            return requestId === request.requestId
        }

        return publishAndWaitForResponseMessage(
            () => this.publisher.publish(streamPartId, request),
            matchFn,
            () => this.createSubscription(),
            () => this.subscribe.reset(),
            this.destroySignal,
        )
    }

    async response(
        subscriberId: EthereumAddress, 
        response: GroupKeyResponse | GroupKeyErrorResponse
    ): Promise<StreamMessage<GroupKeyResponse | GroupKeyErrorResponse> | undefined> {
        // hack overriding toStreamMessage method to set correct encryption type
        const toStreamMessage = response.toStreamMessage.bind(response)
        response.toStreamMessage = (...args) => {
            const msg = toStreamMessage(...args)
            if (msg.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE) {
                msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.RSA
            }
            return msg
        }

        return this.publisher.publish(KeyExchangeStreamIDUtils.formStreamPartID(subscriberId), response)
    }
}
