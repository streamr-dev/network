import { StreamID, StreamPartID, StreamPartIDUtils, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress, Logger, collect, randomString, toEthereumAddress, wait } from '@streamr/utils'
import random from 'lodash/random'
import without from 'lodash/without'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { HttpUtil, createQueryString } from '../HttpUtil'
import { Message } from '../Message'
import { StreamrClientError } from '../StreamrClientError'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StorageNodeRegistry } from '../registry/StorageNodeRegistry'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
import { counting } from '../utils/GeneratorUtils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessageStream } from './MessageStream'
import { createSubscribePipeline } from './subscribePipeline'

type QueryDict = Record<string, string | number | boolean | null | undefined>

export interface ResendRef {
    timestamp: number | Date | string
    sequenceNumber?: number
}

/**
 * Resend the latest "n" messages.
 */
export interface ResendLastOptions {
    last: number
}

/**
 * Resend messages starting from a given point in time.
 */
export interface ResendFromOptions {
    from: ResendRef
    publisherId?: string
}

/**
 * Resend messages between two points in time.
 */
export interface ResendRangeOptions {
    from: ResendRef
    to: ResendRef
    msgChainId?: string
    publisherId?: string
}

/**
 * The supported resend types.
 */
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

const createUrl = (baseUrl: string, endpointSuffix: string, streamPartId: StreamPartID, query: QueryDict = {}): string => {
    const queryMap = {
        ...query,
        format: 'raw'
    }
    const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
    const queryString = createQueryString(queryMap)
    return `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/partitions/${streamPartition}/${endpointSuffix}?${queryString}`
}

@scoped(Lifecycle.ContainerScoped)
export class Resends {
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly storageNodeRegistry: StorageNodeRegistry
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly httpUtil: HttpUtil
    private readonly groupKeyManager: GroupKeyManager
    private readonly destroySignal: DestroySignal
    private readonly config: StrictStreamrClientConfig
    private readonly loggerFactory: LoggerFactory
    private readonly logger: Logger

    constructor(
        streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => StorageNodeRegistry)) storageNodeRegistry: StorageNodeRegistry,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        httpUtil: HttpUtil,
        groupKeyManager: GroupKeyManager,
        destroySignal: DestroySignal,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig,
        loggerFactory: LoggerFactory
    ) {
        this.streamStorageRegistry = streamStorageRegistry
        this.storageNodeRegistry = storageNodeRegistry
        this.streamRegistryCached = streamRegistryCached
        this.httpUtil = httpUtil
        this.groupKeyManager = groupKeyManager
        this.destroySignal = destroySignal
        this.config = config
        this.loggerFactory = loggerFactory
        this.logger = loggerFactory.createLogger(module)
    }

    resend(streamPartId: StreamPartID, options: ResendOptions): Promise<MessageStream> {
        const getStorageNodes = (streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId)

        if (isResendLast(options)) {
            return this.last(streamPartId, {
                count: options.last,
            }, false, getStorageNodes)
        }

        if (isResendRange(options)) {
            return this.range(streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                toTimestamp: new Date(options.to.timestamp).getTime(),
                toSequenceNumber: options.to.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined,
                msgChainId: options.msgChainId,
            }, false, getStorageNodes)
        }

        if (isResendFrom(options)) {
            return this.from(streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined,
            }, false, getStorageNodes)
        }

        throw new StreamrClientError(
            `can not resend without valid resend options: ${JSON.stringify({ streamPartId, options })}`,
            'INVALID_ARGUMENT'
        )
    }

    private async fetchStream(
        endpointSuffix: 'last' | 'range' | 'from',
        streamPartId: StreamPartID,
        query: QueryDict,
        raw: boolean,
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>
    ): Promise<MessageStream> {
        const traceId = randomString(5)
        this.logger.debug('Fetch resend data', {
            loggerIdx: traceId,
            resendType: endpointSuffix,
            streamPartId,
            query
        })
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)
        const nodeAddresses = await getStorageNodes(streamId)
        if (!nodeAddresses.length) {
            throw new StreamrClientError(`no storage assigned: ${streamId}`, 'NO_STORAGE_NODES')
        }

        const nodeAddress = nodeAddresses[random(0, nodeAddresses.length - 1)]
        const nodeUrl = (await this.storageNodeRegistry.getStorageNodeMetadata(nodeAddress)).http
        const url = createUrl(nodeUrl, endpointSuffix, streamPartId, query)
        const config = (nodeAddresses.length > 1) ? this.config : { ...this.config, orderMessages: false }
        const messageStream = (raw === false) ? createSubscribePipeline({
            streamPartId,
            getStorageNodes: async () => without(nodeAddresses, nodeAddress),
            resends: this,
            groupKeyManager: this.groupKeyManager,
            streamRegistryCached: this.streamRegistryCached,
            destroySignal: this.destroySignal,
            config,
            loggerFactory: this.loggerFactory
        }) : new MessageStream()

        const dataStream = this.httpUtil.fetchHttpStream(url)
        messageStream.pull(counting(dataStream, (count: number) => {
            this.logger.debug('Finished resend', { loggerIdx: traceId, messageCount: count })
        }))
        return messageStream
    }

    async last(
        streamPartId: StreamPartID,
        { count }: { count: number },
        raw: boolean,
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>
    ): Promise<MessageStream> {
        if (count <= 0) {
            const emptyStream = new MessageStream()
            emptyStream.endWrite()
            return emptyStream
        }

        return this.fetchStream('last', streamPartId, {
            count,
        }, raw, getStorageNodes)
    }

    private async from(streamPartId: StreamPartID, {
        fromTimestamp,
        fromSequenceNumber,
        publisherId
    }: {
        fromTimestamp: number
        fromSequenceNumber?: number
        publisherId?: EthereumAddress
    }, raw: boolean, getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>): Promise<MessageStream> {
        return this.fetchStream('from', streamPartId, {
            fromTimestamp,
            fromSequenceNumber,
            publisherId,
        }, raw, getStorageNodes)
    }

    async range(streamPartId: StreamPartID, {
        fromTimestamp,
        fromSequenceNumber,
        toTimestamp,
        toSequenceNumber,
        publisherId,
        msgChainId
    }: {
        fromTimestamp: number
        fromSequenceNumber?: number
        toTimestamp: number
        toSequenceNumber?: number
        publisherId?: EthereumAddress
        msgChainId?: string
    }, raw: boolean, getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>): Promise<MessageStream> {
        return this.fetchStream('range', streamPartId, {
            fromTimestamp,
            fromSequenceNumber,
            toTimestamp,
            toSequenceNumber,
            publisherId,
            msgChainId
        }, raw, getStorageNodes)
    }

    async waitForStorage(message: Message, {
        // eslint-disable-next-line no-underscore-dangle
        interval = this.config._timeouts.storageNode.retryInterval,
        // eslint-disable-next-line no-underscore-dangle
        timeout = this.config._timeouts.storageNode.timeout,
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
                this.logger.debug('Timed out waiting for storage to contain message', {
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
                    this.logger.debug('Found matching message')
                    return
                }
            }

            this.logger.debug('Retry after delay (matching message not found)', {
                expected: message.streamMessage.getMessageID(),
                'last-3': last.slice(-3).map((l) => l.streamMessage.getMessageID()),
                delayInMs: interval
            })

            await wait(interval)
        }
        /* eslint-enable no-await-in-loop */
    }
}
