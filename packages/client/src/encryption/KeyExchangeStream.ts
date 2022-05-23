import {
    StreamMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyErrorResponse,
    StreamIDUtils,
    EthereumAddress
} from 'streamr-client-protocol'
import { Lifecycle, scoped, delay, inject } from 'tsyringe'

import { pOnce, Defer, instanceId, Deferred } from '../utils'
import { Context } from '../utils/Context'
import { DestroySignal } from '../DestroySignal'

import { Subscriber } from '../subscribe/Subscriber'
import { Publisher } from '../publish/Publisher'
import { Subscription } from '../subscribe/Subscription'
import { Ethereum } from '../Ethereum'
import { Stoppable } from '../utils/Stoppable'

import { GroupKey, GroupKeyish } from './GroupKey'

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

type MessageMatch = (content: any, streamMessage: StreamMessage) => boolean

function waitForSubMessage(
    sub: Subscription<unknown>,
    matchFn: MessageMatch
): Deferred<StreamMessage> {
    const task = Defer<StreamMessage>()
    const onMessage = (streamMessage: StreamMessage) => {
        try {
            if (matchFn(streamMessage.getContent(), streamMessage)) {
                task.resolve(streamMessage)
            }
        } catch (err) {
            task.reject(err)
        }
    }
    task.finally(async () => {
        await sub.unsubscribe()
    }).catch(() => {}) // important: prevent unchained finally cleanup causing unhandled rejection
    sub.consume(onMessage).catch((err) => task.reject(err))
    sub.onError.listen(task.reject)
    return task
}

const { GROUP_KEY_RESPONSE, GROUP_KEY_ERROR_RESPONSE } = StreamMessage.MESSAGE_TYPES

@scoped(Lifecycle.ContainerScoped)
export class KeyExchangeStream implements Context, Stoppable {
    readonly id
    readonly debug
    subscribe: (() => Promise<Subscription<unknown>>) & { reset(): void }
    isStopped = false
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
        const streamId = StreamIDUtils.formKeyExchangeStreamID(publisherId)
        const sub = await this.subscriber.subscribe(streamId)
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

    stop(): void {
        this.isStopped = true
    }

    async request(publisherId: EthereumAddress, request: GroupKeyRequest): Promise<StreamMessage<unknown> | undefined> {
        if (this.isStopped) { return undefined }

        const streamId = StreamIDUtils.formKeyExchangeStreamID(publisherId)

        let responseTask: Deferred<StreamMessage<unknown>> | undefined
        const onDestroy = () => {
            if (responseTask) {
                responseTask.resolve(undefined)
            }
        }

        this.destroySignal.onDestroy.listen(onDestroy)
        let sub: Subscription<unknown> | undefined
        try {
            sub = await this.createSubscription()
            if (this.isStopped || !sub) { return undefined }
            responseTask = waitForSubMessage(sub, (content, streamMessage) => {
                const { messageType } = streamMessage
                if (messageType !== GROUP_KEY_RESPONSE && messageType !== GROUP_KEY_ERROR_RESPONSE) {
                    return false
                }

                return GroupKeyResponse.fromArray(content).requestId === request.requestId
            })

            if (this.isStopped) { return undefined }

            await this.publisher.publish(streamId, request)

            if (this.isStopped) {
                responseTask.resolve(undefined)
                return undefined
            }

            return await responseTask
        } catch (err) {
            if (responseTask) {
                responseTask.reject(err)
            }
            throw err
        } finally {
            this.destroySignal.onDestroy.unlisten(onDestroy)
            this.subscribe.reset()
            if (sub) {
                await sub.unsubscribe()
            }
            await responseTask
        }
    }

    async response(
        subscriberId: EthereumAddress, 
        response: GroupKeyResponse | GroupKeyErrorResponse
    ): Promise<StreamMessage<GroupKeyResponse | GroupKeyErrorResponse> | undefined> {
        if (this.isStopped) { return undefined }

        // hack overriding toStreamMessage method to set correct encryption type
        const toStreamMessage = response.toStreamMessage.bind(response)
        response.toStreamMessage = (...args) => {
            const msg = toStreamMessage(...args)
            msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.RSA
            return msg
        }

        return this.publisher.publish(StreamIDUtils.formKeyExchangeStreamID(subscriberId), response)
    }
}
