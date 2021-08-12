import {
    StreamMessage, GroupKeyRequest, GroupKeyResponse, GroupKeyErrorResponse, Errors
} from 'streamr-client-protocol'
import { Lifecycle, scoped, delay, inject } from 'tsyringe'

import { pOnce, Defer, instanceId } from '../utils'
import { EthereumAddress } from '../types'
import { Context } from '../utils/Context'

import Subscriber from '../Subscriber'
import Publisher from '../Publisher'
import Subscription from '../Subscription'
import Session from '../Session'
import Ethereum from '../Ethereum'
import { Stoppable } from '../utils/Stoppable'

import { GroupKey, GroupKeyish } from './Encryption'
const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange'

export const { ValidationError } = Errors

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
): ReturnType<typeof Defer> & Promise<StreamMessage | undefined> {
    const task = Defer<StreamMessage | undefined>()
    const onMessage = (streamMessage: StreamMessage) => {
        try {
            if (matchFn(streamMessage.getContent(), streamMessage)) {
                task.resolve(streamMessage)
            }
        } catch (err) {
            task.reject(err)
        }
    }
    sub.consume(onMessage)
    task.finally(async () => {
        await sub.unsubscribe()
    }).catch(() => {}) // important: prevent unchained finally cleanup causing unhandled rejection
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
        private session: Session,
        private subscriber: Subscriber,
        @inject(delay(() => Publisher)) private publisher: Publisher
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.subscribe = pOnce(this.createSubscription.bind(this))
    }

    private async createSubscription() {
        await this.session.getSessionToken() // trigger auth errors if any
        // subscribing to own keyexchange stream
        const publisherId = await this.ethereum.getAddress()
        const streamId = getKeyExchangeStreamId(publisherId)
        const sub = await this.subscriber.subscribe(streamId)
        sub.onFinally(() => {
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

        let responseTask
        let sub: Subscription<unknown> | undefined
        try {
            sub = await this.createSubscription()
            if (this.isStopped || !sub) { return undefined }
            responseTask = waitForSubMessage(sub, (content, streamMessage) => {
                const { messageType } = streamMessage
                if (!(messageType === GROUP_KEY_RESPONSE || messageType === GROUP_KEY_ERROR_RESPONSE)) {
                    return false
                }

                return GroupKeyResponse.fromArray(content).requestId === request.requestId
            })

            if (this.isStopped) { return undefined }

            // @ts-expect-error TODO
            await this.publisher.publish(streamId, request)

            return await responseTask
        } finally {
            if (sub) {
                await sub.unsubscribe()
            }

            this.subscribe.reset()
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

        // @ts-expect-error TODO
        return this.publisher.publish(getKeyExchangeStreamId(subscriberId), response)
    }
}
