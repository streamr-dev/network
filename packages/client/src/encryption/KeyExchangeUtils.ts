import type { GroupKeyRequest, GroupKeyErrorResponse
} from 'streamr-client-protocol'
import {
    StreamMessage, GroupKeyResponse
} from 'streamr-client-protocol'
import { Lifecycle, scoped, delay, inject } from 'tsyringe'

import type { Deferred } from '../utils'
import { pOnce, Defer, instanceId } from '../utils'
import type { EthereumAddress } from '../types'
import type { Context } from '../utils/Context'
import type { DestroySignal } from '../DestroySignal'

import type Subscriber from '../Subscriber'
import Publisher from '../Publisher'
import type Subscription from '../Subscription'
import type Ethereum from '../Ethereum'
import type { Stoppable } from '../utils/Stoppable'

import type { GroupKeyish } from './Encryption'
import { GroupKey } from './Encryption'

const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

export function isKeyExchangeStream(id = '') {
    return id.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

export type GroupKeyId = string
export type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

export type EncryptionConfig = {
    groupKeys: Record<string, GroupKeysSerialized>
}

export function getKeyExchangeStreamId(address: EthereumAddress) {
    if (isKeyExchangeStream(address)) {
        return address // prevent ever double-handling
    }
    return `${KEY_EXCHANGE_STREAM_PREFIX}/${address.toLowerCase()}`
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
    sub.onError(task.reject)
    return task
}

const { GROUP_KEY_RESPONSE, GROUP_KEY_ERROR_RESPONSE } = StreamMessage.MESSAGE_TYPES

@scoped(Lifecycle.ContainerScoped)
export class KeyExchangeStream implements Context, Stoppable {
    id
    debug
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

    private async createSubscription() {
        // subscribing to own keyexchange stream
        const publisherId = await this.ethereum.getAddress()
        const streamId = getKeyExchangeStreamId(publisherId)
        const sub = await this.subscriber.subscribe(streamId)
        const onDestroy = () => {
            return sub.unsubscribe()
        }
        this.destroySignal.onDestroy.listen(onDestroy)
        sub.onBeforeFinally(() => {
            this.destroySignal.onDestroy.unlisten(onDestroy)
            this.subscribe.reset()
        })
        return sub
    }

    stop() {
        this.isStopped = true
    }

    async request(publisherId: string, request: GroupKeyRequest) {
        if (this.isStopped) { return undefined }

        const streamId = getKeyExchangeStreamId(publisherId)

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

    async response(subscriberId: string, response: GroupKeyResponse | GroupKeyErrorResponse) {
        if (this.isStopped) { return undefined }

        // hack overriding toStreamMessage method to set correct encryption type
        const toStreamMessage = response.toStreamMessage.bind(response)
        response.toStreamMessage = (...args) => {
            const msg = toStreamMessage(...args)
            msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.RSA
            return msg
        }

        return this.publisher.publish(getKeyExchangeStreamId(subscriberId), response)
    }
}
