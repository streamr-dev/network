import {
    ChangeFieldType,
    EthereumAddress,
    HexString,
    Logger,
    StreamID,
    StreamPartID,
    StreamPartIDUtils,
    UserID,
    randomString,
    toUserId
} from '@streamr/utils'
import random from 'lodash/random'
import sample from 'lodash/sample'
import without from 'lodash/without'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientError } from '../StreamrClientError'
import { StorageNodeRegistry } from '../contracts/StorageNodeRegistry'
import { StreamMessage } from '../protocol/StreamMessage'
import { convertBytesToStreamMessage } from '../protocol/oldStreamMessageBinaryUtils'
import { forEach, map, transformError } from '../utils/GeneratorUtils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { pull } from '../utils/PushBuffer'
import { PushPipeline } from '../utils/PushPipeline'
import {
    FetchHttpStreamResponseError,
    createQueryString,
    fetchLengthPrefixedFrameHttpBinaryStream
} from '../utils/utils'
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
    publisherId?: HexString
}

/**
 * Resend messages between two points in time.
 */
export interface ResendRangeOptions {
    from: ResendRef
    to: ResendRef
    msgChainId?: string
    publisherId?: HexString
}

/**
 * The supported resend types.
 */
export type ResendOptions = ResendLastOptions | ResendFromOptions | ResendRangeOptions

export type InternalResendOptions =
    | ResendLastOptions
    | ChangeFieldType<ResendFromOptions, 'publisherId', UserID | undefined>
    | ChangeFieldType<ResendRangeOptions, 'publisherId', UserID | undefined>

export type ResendType = 'last' | 'from' | 'range'

function isResendLast<T extends ResendLastOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'last' in options && options.last != null
}

function isResendFrom<T extends ResendFromOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'from' in options && !('to' in options) && options.from != null
}

function isResendRange<T extends ResendRangeOptions>(options: any): options is T {
    return (
        options &&
        typeof options === 'object' &&
        'from' in options &&
        'to' in options &&
        options.to &&
        options.from != null
    )
}

const createUrl = (
    baseUrl: string,
    endpointSuffix: string,
    streamPartId: StreamPartID,
    query: QueryDict = {}
): string => {
    const queryMap = {
        ...query,
        format: 'raw'
    }
    const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
    const queryString = createQueryString(queryMap)
    return `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/partitions/${streamPartition}/${endpointSuffix}?${queryString}`
}

const getHttpErrorTransform = (): ((error: any) => Promise<StreamrClientError>) => {
    return async (err: any) => {
        let message
        if (err instanceof FetchHttpStreamResponseError) {
            const body = await err.response.text()
            let descriptionSnippet
            try {
                const json = JSON.parse(body)
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                descriptionSnippet = `: ${json.error}`
            } catch {
                descriptionSnippet = ''
            }
            message = `Storage node fetch failed${descriptionSnippet}, httpStatus=${err.response.status}, url=${err.response.url}`
        } else {
            message = err?.message ?? 'Unknown error'
        }
        return new StreamrClientError(message, 'STORAGE_NODE_ERROR')
    }
}

export const toInternalResendOptions = (options: ResendOptions): InternalResendOptions => {
    return {
        ...options,
        publisherId:
            'publisherId' in options && options.publisherId !== undefined ? toUserId(options.publisherId) : undefined
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Resends {
    private readonly storageNodeRegistry: StorageNodeRegistry
    private readonly messagePipelineFactory: MessagePipelineFactory
    private readonly config: StrictStreamrClientConfig
    private readonly logger: Logger

    constructor(
        @inject(delay(() => StorageNodeRegistry)) storageNodeRegistry: StorageNodeRegistry,
        @inject(delay(() => MessagePipelineFactory)) messagePipelineFactory: MessagePipelineFactory,
        @inject(ConfigInjectionToken) config: StrictStreamrClientConfig,
        loggerFactory: LoggerFactory
    ) {
        this.storageNodeRegistry = storageNodeRegistry
        this.messagePipelineFactory = messagePipelineFactory
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    async resend(
        streamPartId: StreamPartID,
        options: InternalResendOptions & { raw?: boolean },
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
        abortSignal?: AbortSignal
    ): Promise<PushPipeline<StreamMessage, StreamMessage>> {
        const raw = options.raw ?? false
        if (isResendLast(options)) {
            if (options.last <= 0) {
                const emptyStream = new PushPipeline<StreamMessage, StreamMessage>()
                emptyStream.endWrite()
                return emptyStream
            }
            return this.fetchStream(
                'last',
                streamPartId,
                {
                    count: options.last
                },
                raw,
                getStorageNodes,
                abortSignal
            )
        } else if (isResendRange(options)) {
            return this.fetchStream(
                'range',
                streamPartId,
                {
                    fromTimestamp: new Date(options.from.timestamp).getTime(),
                    fromSequenceNumber: options.from.sequenceNumber,
                    toTimestamp: new Date(options.to.timestamp).getTime(),
                    toSequenceNumber: options.to.sequenceNumber,
                    publisherId: options.publisherId,
                    msgChainId: options.msgChainId
                },
                raw,
                getStorageNodes,
                abortSignal
            )
        } else if (isResendFrom(options)) {
            return this.fetchStream(
                'from',
                streamPartId,
                {
                    fromTimestamp: new Date(options.from.timestamp).getTime(),
                    fromSequenceNumber: options.from.sequenceNumber,
                    publisherId: options.publisherId
                },
                raw,
                getStorageNodes,
                abortSignal
            )
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
        getStorageNodes: (streamId: StreamID) => Promise<EthereumAddress[]>,
        abortSignal?: AbortSignal
    ): Promise<PushPipeline<StreamMessage, StreamMessage>> {
        const traceId = randomString(5)
        this.logger.debug('Fetch resend data', {
            loggerIdx: traceId,
            resendType,
            streamPartId,
            query
        })
        const streamId = StreamPartIDUtils.getStreamID(streamPartId)
        const nodeAddresses = await getStorageNodes(streamId)
        if (!nodeAddresses.length) {
            throw new StreamrClientError(`no storage assigned: ${streamId}`, 'NO_STORAGE_NODES')
        }
        const nodeAddress = nodeAddresses[random(0, nodeAddresses.length - 1)]
        const nodeUrls = (await this.storageNodeRegistry.getStorageNodeMetadata(nodeAddress)).urls
        const url = createUrl(sample(nodeUrls)!, resendType, streamPartId, query)
        const messageStream = raw
            ? new PushPipeline<StreamMessage, StreamMessage>()
            : this.messagePipelineFactory.createMessagePipeline({
                  streamPartId,
                  /*
                   * Disable ordering if the source of this resend is the only storage node. In that case there is no
                   * other storage node from which we could fetch the gaps. When we set "disableMessageOrdering"
                   * to true, we disable both gap filling and message ordering. As resend messages always arrive
                   * in ascending order, we don't need the ordering functionality.
                   */
                  getStorageNodes: async () => without(nodeAddresses, nodeAddress),
                  config: nodeAddresses.length === 1 ? { ...this.config, orderMessages: false } : this.config
              })
        const lines = transformError(
            fetchLengthPrefixedFrameHttpBinaryStream(url, abortSignal),
            getHttpErrorTransform()
        )
        setImmediate(async () => {
            let count = 0
            const messages = map(lines, (bytes: Uint8Array) => convertBytesToStreamMessage(bytes))
            await pull(
                forEach(messages, () => count++),
                messageStream
            )
            this.logger.debug('Finished resend', { loggerIdx: traceId, messageCount: count })
        })
        return messageStream
    }
}
