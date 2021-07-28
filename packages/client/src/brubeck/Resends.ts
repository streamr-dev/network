import { SPID, SID, MessageRef, StreamMessage } from 'streamr-client-protocol'
import AbortController from 'node-abort-controller'
import MessageStream from './MessageStream'
import SubscribePipeline from './SubscribePipeline'
import { StorageNode } from '../stream/StorageNode'
import { authRequest } from './authFetch'
import { instanceId } from '../utils'
import { Context, ContextError } from '../utils/Context'
import { inspect } from '../utils/log'
import split2 from 'split2'
import Session from './Session'
import NodeRegistry from './NodeRegistry'
import { Transform } from 'stream'
import { StreamEndpoints } from './StreamEndpoints'
import { BrubeckContainer } from './Container'
import { DependencyContainer, inject, Lifecycle, scoped, delay } from 'tsyringe'

const MIN_SEQUENCE_NUMBER_VALUE = 0

type QueryDict = Record<string, string | number | boolean | null | undefined>

async function fetchStream(url: string, session: Session, opts = {}, abortController = new AbortController()) {
    const startTime = Date.now()
    const response = await authRequest(url, session, {
        signal: abortController.signal,
        ...opts,
    })

    const stream: Transform = response.body.pipe(split2((message: string) => {
        return StreamMessage.deserialize(message)
    }))
    stream.once('close', () => {
        abortController.abort()
    })
    return Object.assign(stream, {
        startTime,
    })
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
    sequenceNumber: number,
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

export type ResendOptions = ResendLastOptions | ResendFromOptions | ResendRangeOptions

function isResendLast<T extends ResendLastOptions>(options: any): options is T {
    return options && 'last' in options && options.last != null
}

function isResendFrom<T extends ResendFromOptions>(options: any): options is T {
    return options && 'from' in options && !('to' in options) && options.from != null
}

function isResendRange<T extends ResendRangeOptions>(options: any): options is T {
    return options && 'from' in options && 'to' in options && options.to && options.from != null
}

@scoped(Lifecycle.ContainerScoped)
export default class Resend implements Context {
    id
    debug

    constructor(
        context: Context,
        private nodeRegistry: NodeRegistry,
        @inject(delay(() => StreamEndpoints)) private streamEndpoints: StreamEndpoints,
        private session: Session,
        @inject(BrubeckContainer) private container: DependencyContainer
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    /**
     * Call last/from/range as appropriate based on arguments
     */

    resend<T>(options: (SID | { stream: SID }) & (ResendOptions | { resend: ResendOptions })): Promise<MessageStream<T>> {
        const resendOptions = ('resend' in options && options.resend ? options.resend : options) as ResendOptions
        const spidOptions = ('stream' in options && options.stream ? options.stream : options) as SID
        const spid = SPID.fromDefaults(spidOptions, { streamPartition: 0 })
        return this.resendMessages(spid, resendOptions)
    }

    resendMessages<T>(spid: SPID, options: ResendOptions): Promise<MessageStream<T>> {
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

    async getStreamNodes(sid: SID) {
        // this method should probably live somewhere else
        // like in the node registry or stream class
        const stream = await this.streamEndpoints.getStream(sid.streamId)
        const storageNodes: StorageNode[] = await stream.getStorageNodes()

        const storageNodeAddresses = new Set(storageNodes.map((n) => n.getAddress()))

        const nodes = await this.nodeRegistry.getNodes()

        return nodes.filter((node: any) => storageNodeAddresses.has(node.address))
    }

    private async fetchStream<T>(endpointSuffix: 'last' | 'range' | 'from', spid: SPID, query: QueryDict = {}) {
        const nodes = await this.getStreamNodes(spid)
        if (!nodes.length) {
            throw new ContextError(this, `no storage assigned: ${inspect(spid)}`)
        }

        // just pick first node
        // TODO: handle multiple nodes
        const url = createUrl(`${nodes[0].url}/api/v1`, endpointSuffix, spid, query)
        const messageStream = SubscribePipeline<T>(spid, {}, this.container.resolve<Context>(Context as any), this.container)
        messageStream.pull((async function* readStream(this: Resend) {
            const dataStream = await fetchStream(url, this.session)
            try {
                yield* dataStream
            } finally {
                this.debug('destroy')
                dataStream.destroy()
            }
        }.bind(this)()))
        return messageStream
    }

    async last<T>(spid: SPID, { count }: { count: number }): Promise<MessageStream<T>> {
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
        return this.fetchStream('from', spid, {
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
