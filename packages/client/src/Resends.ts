/**
 * Public Resends API
 */
import { DependencyContainer, inject, Lifecycle, scoped, delay } from 'tsyringe'
import { SPID, SIDLike, MessageRef, StreamMessage } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'
import split2 from 'split2'
import { Transform } from 'stream'

import { instanceId, counterId } from './utils'
import { Context, ContextError } from './utils/Context'
import { inspect } from './utils/log'

import MessageStream, { MessageStreamOnMessage } from './MessageStream'
import SubscribePipeline from './SubscribePipeline'
import { authRequest } from './authFetch'

import { NodeRegistry } from './NodeRegistry'
import { StreamEndpoints } from './StreamEndpoints'
import { BrubeckContainer } from './Container'
import { StreamRegistry } from './StreamRegistry'

const MIN_SEQUENCE_NUMBER_VALUE = 0

type QueryDict = Record<string, string | number | boolean | null | undefined>

async function fetchStream(url: string, opts = {}, abortController = new AbortController()) {
    const startTime = Date.now()
    const response = await authRequest(url, undefined, {
        signal: abortController.signal,
        ...opts,
    })
    try {
        const stream: Transform = response.body.pipe(split2((message: string) => {
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

const createUrl = (baseUrl: string, endpointSuffix: string, spid: SPID, query: QueryDict = {}) => {
    const queryMap = {
        ...query,
        format: 'raw'
    }

    const queryString = new URLSearchParams(Object.entries(queryMap).filter(([_key, value]) => value != null)).toString()

    return `${baseUrl}/streams/${encodeURIComponent(spid.streamId)}/data/partitions/${spid.streamPartition}/${endpointSuffix}?${queryString}`
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

export type ResendOptions = (SIDLike | { stream: SIDLike }) & (ResendOptionsStrict | { resend: ResendOptionsStrict })

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
        private streamRegistry: StreamRegistry,
        @inject(delay(() => StreamEndpoints)) private streamEndpoints: StreamEndpoints,
        @inject(BrubeckContainer) private container: DependencyContainer,
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
        const spidOptions = (options && typeof options === 'object' && 'stream' in options && options.stream ? options.stream : options) as SIDLike
        const spid = SPID.fromDefaults(spidOptions, { streamPartition: 0 })

        const sub = await this.resendMessages<T>(spid, resendOptions)

        if (onMessage) {
            sub.useLegacyOnMessageHandler(onMessage)
        }

        return sub
    }

    resendMessages<T>(spid: SPID, options: ResendOptionsStrict): Promise<MessageStream<T>> {
        if (isResendLast(options)) {
            return this.last<T>(spid, {
                count: options.last,
            })
        }

        if (isResendRange(options)) {
            return this.range<T>(spid, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                toTimestamp: new Date(options.to.timestamp).getTime(),
                toSequenceNumber: options.to.sequenceNumber,
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
            })
        }

        if (isResendFrom(options)) {
            return this.from<T>(spid, {
                fromTimestamp: new Date(options.from.timestamp).getTime(),
                fromSequenceNumber: options.from.sequenceNumber,
                publisherId: options.publisherId,
            })
        }

        throw new ContextError(this, `can not resend without valid resend options: ${inspect({ spid, options })}`)
    }

    async getStreamNodes(sidLike: SIDLike) {
        const sid = SPID.parse(sidLike)
        const stream = await this.streamRegistry.getStream(sid.streamId)
        return stream.getStorageNodes()
    }

    private async fetchStream<T>(endpointSuffix: 'last' | 'range' | 'from', spid: SPID, query: QueryDict = {}) {
        const debug = this.debug.extend(counterId(`resend-${endpointSuffix}`))
        debug('fetching resend %s %s %o', endpointSuffix, spid.key, query)
        const nodes = await this.getStreamNodes(spid)
        if (!nodes.length) {
            const err = new ContextError(this, `no storage assigned: ${inspect(spid)}`)
            err.code = 'NO_STORAGE_NODES'
            throw err
        }

        // just pick first node
        // TODO: handle multiple nodes
        const url = createUrl(`${nodes[0].url}/api/v1`, endpointSuffix, spid, query)
        const messageStream = SubscribePipeline<T>(
            new MessageStream<T>(this),
            spid,
            this.container.resolve<Context>(Context as any),
            this.container
        )

        let count = 0
        messageStream.forEach(() => {
            count += 1
        })

        messageStream.pull(async function* readStream(this: Resend) {
            let dataStream
            try {
                dataStream = await fetchStream(url)
                yield* dataStream
            } finally {
                debug('resent %s messages.', count)
                if (dataStream) {
                    dataStream.destroy()
                }
            }
        }.bind(this)())
        return messageStream
    }

    async last<T>(spid: SPID, { count }: { count: number }): Promise<MessageStream<T>> {
        if (count <= 0) {
            const emptyStream = new MessageStream<T>(this)
            emptyStream.endWrite()
            return emptyStream
        }

        return this.fetchStream('last', spid, {
            count,
        })
    }

    async from<T>(spid: SPID, {
        fromTimestamp,
        fromSequenceNumber = MIN_SEQUENCE_NUMBER_VALUE,
        publisherId
    }: {
        fromTimestamp: number,
        fromSequenceNumber?: number,
        publisherId?: string
    }): Promise<MessageStream<T>> {
        return this.fetchStream('from', spid, {
            fromTimestamp,
            fromSequenceNumber,
            publisherId,
        })
    }

    async range<T>(spid: SPID, {
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
        return this.fetchStream('range', spid, {
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
