import { inject, Lifecycle, scoped, delay } from 'tsyringe'
import { MessageRef, StreamPartID, StreamPartIDUtils, toStreamPartID } from '@streamr/protocol'

import { MessageStream } from './MessageStream'
import { createSubscribePipeline } from './subscribePipeline'

import { StorageNodeRegistry } from '../registry/StorageNodeRegistry'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { random } from 'lodash'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { HttpUtil } from '../HttpUtil'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
import { EthereumAddress, Logger, toEthereumAddress, wait } from '@streamr/utils'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { SubscriberKeyExchange } from '../encryption/SubscriberKeyExchange'
import { StreamrClientEventEmitter } from '../events'
import { DestroySignal } from '../DestroySignal'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { counterId } from '../utils/utils'
import { StreamrClientError } from '../StreamrClientError'
import { collect } from '../utils/iterators'
import { counting } from '../utils/GeneratorUtils'
import { Message } from '../Message'

const MIN_SEQUENCE_NUMBER_VALUE = 0

type QueryDict = Record<string, string | number | boolean | null | undefined>

export type ResendRef = MessageRef | {
    timestamp: number | Date | string
    sequenceNumber?: number
}

export interface ResendLastOptions {
    last: number
}

export interface ResendFromOptions {
    from: ResendRef
    publisherId?: string
}

export interface ResendRangeOptions {
    from: ResendRef
    to: ResendRef
    msgChainId?: string
    publisherId?: string
}

export type ResendOptions = ResendLastOptions | ResendFromOptions | ResendRangeOptions

function isResendLast<T extends ResendLastOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'last' in options && options.last != null
}

function isResendFrom<T extends ResendFromOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'from' in options && !('to' in options) && options.from != null
}

function isResendRange<T extends ResendRangeOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'from' in options && 'to' in options && options.to && options.from != null
}

@scoped(Lifecycle.ContainerScoped)
export class Resends {
    private readonly groupKeyStore: GroupKeyStore
    private readonly subscriberKeyExchange: SubscriberKeyExchange
    private readonly streamrClientEventEmitter: StreamrClientEventEmitter
    private readonly destroySignal: DestroySignal
    private readonly rootConfig: StrictStreamrClientConfig
    private readonly loggerFactory: LoggerFactory
    private readonly logger: Logger

    constructor(
        @inject(StreamStorageRegistry) private streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => StorageNodeRegistry)) private storageNodeRegistry: StorageNodeRegistry,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(delay(() => StreamRegistryCached)) private streamRegistryCached: StreamRegistryCached,
        @inject(HttpUtil) private httpUtil: HttpUtil,
        groupKeyStore: GroupKeyStore,
        subscriberKeyExchange: SubscriberKeyExchange,
        streamrClientEventEmitter: StreamrClientEventEmitter,
        destroySignal: DestroySignal,
        @inject(ConfigInjectionToken.Root) rootConfig: StrictStreamrClientConfig,
        @inject(LoggerFactory) loggerFactory: LoggerFactory
    ) {
        this.groupKeyStore = groupKeyStore
        this.subscriberKeyExchange = subscriberKeyExchange
        this.streamrClientEventEmitter = streamrClientEventEmitter
        this.destroySignal = destroySignal
        this.rootConfig = rootConfig
        this.loggerFactory = loggerFactory
        this.logger = loggerFactory.createLogger(module)
    }

    resend<T>(streamPartId: StreamPartID, options: ResendOptions): Promise<MessageStream<T>> {
        if (isResendLast(options)) {
            return this.last<T>(streamPartId, {
                count: options.last,
            })
        }

        if (isResendRange(options)) {
            return this.range<T>(streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                toTimestamp: new Date(options.to.timestamp).getTime(),
                toSequenceNumber: options.to.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined,
                msgChainId: options.msgChainId,
            })
        }

        if (isResendFrom(options)) {
            return this.from<T>(streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined,
            })
        }

        throw new StreamrClientError(
            `can not resend without valid resend options: ${JSON.stringify({ streamPartId, options })}`,
            'INVALID_ARGUMENT'
        )
    }

    private async fetchStream<T>(
        endpointSuffix: 'last' | 'range' | 'from',
        streamPartId: StreamPartID,
        query: QueryDict = {}
    ): Promise<MessageStream<T>> {
        const loggerIdx = counterId('fetchStream')
        this.logger.debug('[%s] fetching resend %s for %s with options %o', loggerIdx, endpointSuffix, streamPartId, query)
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)
        const nodeAddresses = await this.streamStorageRegistry.getStorageNodes(streamId)
        if (!nodeAddresses.length) {
            throw new StreamrClientError(`no storage assigned: ${streamId}`, 'NO_STORAGE_NODES')
        }

        const nodeAddress = nodeAddresses[random(0, nodeAddresses.length - 1)]
        const nodeUrl = (await this.storageNodeRegistry.getStorageNodeMetadata(nodeAddress)).http
        const url = this.createUrl(nodeUrl, endpointSuffix, streamPartId, query)
        const messageStream = createSubscribePipeline<T>({
            streamPartId,
            resends: this,
            groupKeyStore: this.groupKeyStore,
            subscriberKeyExchange: this.subscriberKeyExchange,
            streamRegistryCached: this.streamRegistryCached,
            streamrClientEventEmitter: this.streamrClientEventEmitter,
            destroySignal: this.destroySignal,
            rootConfig: this.rootConfig,
            loggerFactory: this.loggerFactory
        })

        const dataStream = this.httpUtil.fetchHttpStream<T>(url)
        messageStream.pull(counting(dataStream, (count: number) => {
            this.logger.debug('[%s] total of %d messages received for resend fetch', loggerIdx, count)
        }))
        return messageStream
    }

    async last<T>(streamPartId: StreamPartID, { count }: { count: number }): Promise<MessageStream<T>> {
        if (count <= 0) {
            const emptyStream = new MessageStream<T>()
            emptyStream.endWrite()
            return emptyStream
        }

        return this.fetchStream('last', streamPartId, {
            count,
        })
    }

    private async from<T>(streamPartId: StreamPartID, {
        fromTimestamp,
        fromSequenceNumber = MIN_SEQUENCE_NUMBER_VALUE,
        publisherId
    }: {
        fromTimestamp: number
        fromSequenceNumber?: number
        publisherId?: EthereumAddress
    }): Promise<MessageStream<T>> {
        return this.fetchStream('from', streamPartId, {
            fromTimestamp,
            fromSequenceNumber,
            publisherId,
        })
    }

    async range<T>(streamPartId: StreamPartID, {
        fromTimestamp,
        fromSequenceNumber = MIN_SEQUENCE_NUMBER_VALUE,
        toTimestamp,
        toSequenceNumber = MIN_SEQUENCE_NUMBER_VALUE,
        publisherId,
        msgChainId
    }: {
        fromTimestamp: number
        fromSequenceNumber?: number
        toTimestamp: number
        toSequenceNumber?: number
        publisherId?: EthereumAddress
        msgChainId?: string
    }): Promise<MessageStream<T>> {
        return this.fetchStream('range', streamPartId, {
            fromTimestamp,
            fromSequenceNumber,
            toTimestamp,
            toSequenceNumber,
            publisherId,
            msgChainId,
        })
    }

    async waitForStorage(message: Message, {
        // eslint-disable-next-line no-underscore-dangle
        interval = this.rootConfig._timeouts.storageNode.retryInterval,
        // eslint-disable-next-line no-underscore-dangle
        timeout = this.rootConfig._timeouts.storageNode.timeout,
        count = 100,
        messageMatchFn = (msgTarget: Message, msgGot: Message) => {
            return msgTarget.signature === msgGot.signature
        }
    }: {
        interval?: number
        timeout?: number
        count?: number
        messageMatchFn?: (msgTarget: Message, msgGot: Message) => boolean
    } = {}): Promise<void> {
        if (!message) {
            throw new StreamrClientError('waitForStorage requires a Message', 'INVALID_ARGUMENT')
        }

        const start = Date.now()
        let last: Message[] | undefined
        let found = false
        while (!found) {
            const duration = Date.now() - start
            if (duration > timeout) {
                this.logger.debug('timed out waiting for storage to have message %j', {
                    expected: message.streamMessage.getMessageID(),
                    lastReceived: last?.map((l) => l.streamMessage.getMessageID()),
                })
                throw new Error(`timed out after ${duration}ms waiting for message`)
            }

            const resendStream = await this.resend(toStreamPartID(message.streamId, message.streamPartition), { last: count })
            last = await collect(resendStream)
            for (const lastMsg of last) {
                if (messageMatchFn(message, lastMsg)) {
                    found = true
                    this.logger.debug('message found')
                    return
                }
            }

            this.logger.debug('message not found, retrying... %j', {
                msg: message.streamMessage.getMessageID(),
                'last 3': last.slice(-3).map((l) => l.streamMessage.getMessageID())
            })

            await wait(interval)
        }
        /* eslint-enable no-await-in-loop */
    }

    private createUrl(baseUrl: string, endpointSuffix: string, streamPartId: StreamPartID, query: QueryDict = {}): string {
        const queryMap = {
            ...query,
            format: 'raw'
        }
        const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
        const queryString = this.httpUtil.createQueryString(queryMap)
        return `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/partitions/${streamPartition}/${endpointSuffix}?${queryString}`
    }
}
