import { StreamID, StreamMessage, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, Logger, randomString, toEthereumAddress } from '@streamr/utils'
import random from 'lodash/random'
import without from 'lodash/without'
import { Response } from 'node-fetch'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientError } from '../StreamrClientError'
import { StorageNodeRegistry } from '../registry/StorageNodeRegistry'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
import { counting } from '../utils/GeneratorUtils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushPipeline } from '../utils/PushPipeline'
import { createQueryString, fetchHttpStream } from '../utils/utils'
import { MessagePipelineFactory } from './MessagePipelineFactory'

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

export type ResendType = 'last' | 'from' | 'range'

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

const parseHttpError = async (response: Response): Promise<Error> => {
    const body = await response.text()
    let descriptionSnippet
    try {
        const json = JSON.parse(body)
        descriptionSnippet = `: ${json.error}`
    } catch (err) {
        descriptionSnippet = ''
    }
    throw new StreamrClientError(
        `Storage node fetch failed${descriptionSnippet}, httpStatus=${response.status}, url=${response.url}`,
        'STORAGE_NODE_ERROR'
    )
}

@scoped(Lifecycle.ContainerScoped)
export class Resends {

    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly storageNodeRegistry: StorageNodeRegistry
    private readonly messagePipelineFactory: MessagePipelineFactory
    private readonly config: StrictStreamrClientConfig
    private readonly logger: Logger

    constructor(
        streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => StorageNodeRegistry)) storageNodeRegistry: StorageNodeRegistry,
        messagePipelineFactory: MessagePipelineFactory,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig,
        loggerFactory: LoggerFactory
    ) {
        this.streamStorageRegistry = streamStorageRegistry
        this.storageNodeRegistry = storageNodeRegistry
        this.messagePipelineFactory = messagePipelineFactory
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    async resend(
        streamPartId: StreamPartID,
        options: ResendOptions & { raw?: boolean },
        getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>
    ): Promise<PushPipeline<StreamMessage, StreamMessage>> {
        const raw = options.raw ?? false
        if (isResendLast(options)) {
            if (options.last <= 0) {
                const emptyStream = new PushPipeline<StreamMessage, StreamMessage>()
                emptyStream.endWrite()
                return emptyStream
            }
            return this.fetchStream('last', streamPartId, {
                count: options.last
            }, raw, getStorageNodes)
        } else if (isResendRange(options)) {
            return this.fetchStream('range', streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                toTimestamp: new Date(options.to.timestamp).getTime(),
                toSequenceNumber: options.to.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined,
                msgChainId: options.msgChainId
            }, raw, getStorageNodes)
        } else if (isResendFrom(options)) {
            return this.fetchStream('from', streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                publisherId: options.publisherId !== undefined ? toEthereumAddress(options.publisherId) : undefined
            }, raw, getStorageNodes)
        } else {
            throw new StreamrClientError(
                `can not resend without valid resend options: ${JSON.stringify({ streamPartId, options })}`,
                'INVALID_ARGUMENT'
            )
        }
    }

    private async fetchStream(
        resendType: ResendType,
        streamPartId: StreamPartID,
        query: QueryDict,
        raw: boolean,
        getStorageNodes?: (streamId: StreamID) => Promise<EthereumAddress[]>
    ): Promise<PushPipeline<StreamMessage, StreamMessage>> {
        const traceId = randomString(5)
        this.logger.debug('Fetch resend data', {
            loggerIdx: traceId,
            resendType,
            streamPartId,
            query
        })
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)
        // eslint-disable-next-line no-underscore-dangle
        const _getStorageNodes = getStorageNodes ?? ((streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId))
        const nodeAddresses = await _getStorageNodes(streamId)
        if (!nodeAddresses.length) {
            throw new StreamrClientError(`no storage assigned: ${streamId}`, 'NO_STORAGE_NODES')
        }

        const nodeAddress = nodeAddresses[random(0, nodeAddresses.length - 1)]
        const nodeUrl = (await this.storageNodeRegistry.getStorageNodeMetadata(nodeAddress)).http
        const url = createUrl(nodeUrl, resendType, streamPartId, query)
        const messageStream = raw ? new PushPipeline<StreamMessage, StreamMessage>() : this.messagePipelineFactory.createMessagePipeline({
            streamPartId,
            /*
             * Disable ordering if the source of this resend is the only storage node. In that case there is no
             * other storage node from which we could fetch the gaps. When we set "disableMessageOrdering"
             * to true, we disable both gap filling and message ordering. As resend messages always arrive 
             * in ascending order, we don't need the ordering functionality.
             */
            getStorageNodes: async () => without(nodeAddresses, nodeAddress),
            config: (nodeAddresses.length === 1) ? { ...this.config, orderMessages: false } : this.config
        })

        const dataStream = fetchHttpStream(url, parseHttpError)
        messageStream.pull(counting(dataStream, (count: number) => {
            this.logger.debug('Finished resend', { loggerIdx: traceId, messageCount: count })
        }))
        return messageStream
    }
}
