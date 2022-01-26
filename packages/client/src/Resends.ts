/**
 * Public Resends API
 */
import { DependencyContainer, inject, Lifecycle, scoped, delay } from 'tsyringe'
import { MessageRef, StreamMessage, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'
import split2 from 'split2'
import { Readable } from 'stream'

import { instanceId, counterId } from './utils'
import { Context, ContextError } from './utils/Context'
import { inspect } from './utils/log'

import MessageStream, { MessageStreamOnMessage } from './MessageStream'
import SubscribePipeline from './SubscribePipeline'
import { authRequest } from './authFetch'

import { NodeRegistry } from './NodeRegistry'
import { StreamEndpoints } from './StreamEndpoints'
import { BrubeckContainer } from './Container'
import { WebStreamToNodeStream } from './utils/WebStreamToNodeStream'
import { createQueryString } from './Rest'
import { StreamIDBuilder } from './StreamIDBuilder'
import { StreamDefinition } from './types'

const MIN_SEQUENCE_NUMBER_VALUE = 0

type QueryDict = Record<string, string | number | boolean | null | undefined>

async function fetchStream(url: string, opts = {}, abortController = new AbortController()) {
    const startTime = Date.now()
    const response = await authRequest(url, {
        signal: abortController.signal,
        ...opts,
    })
    if (!response.body) {
        throw new Error('No Response Body')
    }

    try {
        // in the browser, response.body will be a web stream. Convert this into a node stream.
        const source: Readable = WebStreamToNodeStream(response.body as unknown as (ReadableStream | Readable))

        const stream = source.pipe(split2((message: string) => {
            return StreamMessage.deserialize(message)
        }))

        stream.once('close', () => {
            abortController.abort()
        })

        return Object.assign(stream, {
            startTime,
        })
    } catch (err) {
        abortController.abort()
        throw err
    }
}

const createUrl = (baseUrl: string, endpointSuffix: string, streamPartId: StreamPartID, query: QueryDict = {}) => {
    const queryMap = {
        ...query,
        format: 'raw'
    }
    const [streamId, streamPartition] = StreamPartIDUtils.getStreamIDAndPartition(streamPartId)
    const queryString = createQueryString(queryMap)
    return `${baseUrl}/streams/${encodeURIComponent(streamId)}/data/partitions/${streamPartition}/${endpointSuffix}?${queryString}`
}

export type ResendRef = MessageRef | {
    timestamp: number | Date | string,
    sequenceNumber?: number,
}

export type ResendLastOptions = {
    last: number
}

export type ResendFromOptions = {
    from: ResendRef
    publisherId?: string
}

export type ResendRangeOptions = {
    from: ResendRef
    to: ResendRef
    msgChainId?: string
    publisherId?: string
}

export type ResendOptionsStrict = ResendLastOptions | ResendFromOptions | ResendRangeOptions

function isResendLast<T extends ResendLastOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'last' in options && options.last != null
}

function isResendFrom<T extends ResendFromOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'from' in options && !('to' in options) && options.from != null
}

function isResendRange<T extends ResendRangeOptions>(options: any): options is T {
    return options && typeof options === 'object' && 'from' in options && 'to' in options && options.to && options.from != null
}

export type ResendOptions = StreamDefinition & (ResendOptionsStrict | { resend: ResendOptionsStrict })

export function isResendOptions(options: any): options is ResendOptions {
    if (options && typeof options === 'object' && 'resend' in options && options.resend) {
        return isResendOptions(options.resend)
    }

    if (!options || typeof options !== 'object') { return false }

    return !!(
        isResendLast(options)
        || isResendFrom(options)
        || isResendRange(options)
    )
}

@scoped(Lifecycle.ContainerScoped)
export default class Resend implements Context {
    id
    debug

    constructor(
        context: Context,
        private nodeRegistry: NodeRegistry,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(delay(() => StreamEndpoints)) private streamEndpoints: StreamEndpoints,
        @inject(BrubeckContainer) private container: DependencyContainer
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * Call last/from/range as appropriate based on arguments
     */

    async resend<T>(
        options: ResendOptions,
        onMessage?: MessageStreamOnMessage<T>
    ): Promise<MessageStream<T>> {
        const resendOptions = (
            (options && typeof options === 'object' && 'resend' in options && options.resend ? options.resend : options) as ResendOptionsStrict
        )
        const streamPartId = await this.streamIdBuilder.toStreamPartID(options)

        const sub = await this.resendMessages<T>(streamPartId, resendOptions)

        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }

        return sub
    }

    private resendMessages<T>(streamPartId: StreamPartID, options: ResendOptionsStrict): Promise<MessageStream<T>> {
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
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
            })
        }

        if (isResendFrom(options)) {
            return this.from<T>(streamPartId, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                publisherId: options.publisherId,
            })
        }

        throw new ContextError(this, `can not resend without valid resend options: ${inspect({ streamPartId, options })}`)
    }

    private async fetchStream<T>(
        endpointSuffix: 'last' | 'range' | 'from',
        streamPartId: StreamPartID,
        query: QueryDict = {}
    ) {
        const debug = this.debug.extend(counterId(`resend-${endpointSuffix}`))
        debug('fetching resend %s %s %o', endpointSuffix, streamPartId, query)
        const nodeAdresses = await this.nodeRegistry.getStorageNodesOf(StreamPartIDUtils.getStreamID(streamPartId))
        if (!nodeAdresses.length) {
            const err = new ContextError(this, `no storage assigned: ${inspect(streamPartId)}`)
            err.code = 'NO_STORAGE_NODES'
            throw err
        }

        const nodeUrl = await this.nodeRegistry.getStorageNodeUrl(nodeAdresses[0]) // TODO: handle multiple nodes
        const url = createUrl(nodeUrl, endpointSuffix, streamPartId, query)
        const messageStream = SubscribePipeline<T>(
            new MessageStream<T>(this),
            streamPartId,
            this.container.resolve<Context>(Context as any),
            this.container
        )

        let count = 0
        messageStream.forEach(() => {
            count += 1
        })

        const dataStream = await fetchStream(url)
        messageStream.pull((async function* readStream() {
            try {
                yield* dataStream
            } finally {
                debug('resent %s messages.', count)
                dataStream.destroy()
            }
        }()))
        return messageStream
    }

    private async last<T>(streamPartId: StreamPartID, { count }: { count: number }): Promise<MessageStream<T>> {
        if (count <= 0) {
            const emptyStream = new MessageStream<T>(this)
            emptyStream.endWrite()
            return emptyStream
        }

        return this.fetchStream('last', streamPartId, {
            count,
        })
    }

    async from<T>(streamPartId: StreamPartID, {
        fromTimestamp,
        fromSequenceNumber = MIN_SEQUENCE_NUMBER_VALUE,
        publisherId
    }: {
        fromTimestamp: number,
        fromSequenceNumber?: number,
        publisherId?: string
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
        fromTimestamp: number,
        fromSequenceNumber?: number,
        toTimestamp: number,
        toSequenceNumber?: number,
        publisherId?: string,
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

    async stop() {
        await this.nodeRegistry.stop()
    }
}
