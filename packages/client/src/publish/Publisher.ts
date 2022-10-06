import { EthereumAddress, StreamID, StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject } from 'tsyringe'
import pLimit from 'p-limit'
import { InspectOptions } from 'util'
import { instanceId } from '../utils/utils'
import { Context } from '../utils/Context'
import { StreamDefinition } from '../types'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { NetworkNodeFacade } from '../NetworkNodeFacade'
import { MessageFactory } from './MessageFactory'
import { isString } from 'lodash'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { inspect } from '../utils/log'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { GroupKeyQueue } from './GroupKeyQueue'
import { Mapping } from '../utils/Mapping'

export class PublishError extends Error {

    public streamId: StreamID
    public timestamp: number

    constructor(streamId: StreamID, timestamp: number, cause: Error) {
        // Currently Node and Firefox show the full error chain (this error and
        // the message and the stack of the "cause" variable) when an error is printed
        // to console.log. Chrome shows only the root error.
        // TODO: Remove the cause suffix from the error message when Chrome adds the support:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1211260
        // eslint-disable-next-line max-len
        // @ts-expect-error typescript definitions don't support error cause
        super(`Failed to publish to stream ${streamId} (timestamp=${timestamp}), cause: ${cause.message}`, { cause })
        this.streamId = streamId
        this.timestamp = timestamp
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptions): string {
        return inspect(this, {
            ...options,
            customInspect: false,
            depth,
        })
    }
}

export interface MessageMetadata {
    timestamp?: string | number | Date
    partitionKey?: string | number
    msgChainId?: string
}

const parseTimestamp = (metadata?: MessageMetadata): number => {
    if (metadata?.timestamp === undefined) {
        return Date.now()
    } else {
        return metadata.timestamp instanceof Date
            ? metadata.timestamp.getTime()
            : isString(metadata.timestamp)
                ? new Date(metadata.timestamp).getTime()
                : metadata.timestamp
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Publisher implements Context {
    readonly id
    readonly debug
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly authentication: Authentication
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly node: NetworkNodeFacade
    private readonly concurrencyLimit = pLimit(1)
    private readonly messageFactories: Mapping<[streamId: StreamID], MessageFactory>
    private readonly groupKeyQueues: Mapping<[streamId: StreamID], GroupKeyQueue>

    constructor(
        context: Context,
        streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        streamRegistryCached: StreamRegistryCached,
        groupKeyStore: GroupKeyStore,
        node: NetworkNodeFacade
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
        this.streamRegistryCached = streamRegistryCached
        this.node = node
        this.messageFactories = new Mapping(async (streamId: StreamID) => {
            return this.createMessageFactory(streamId)
        })
        this.groupKeyQueues = new Mapping(async (streamId: StreamID) => {
            return new GroupKeyQueue(streamId, groupKeyStore)
        })
    }

    /* eslint-disable @typescript-eslint/no-shadow */
    private async createMessageFactory(streamId: StreamID): Promise<MessageFactory> {
        const queue = await this.groupKeyQueues.get(streamId)
        return new MessageFactory({
            publisherId: await this.authentication.getAddress(),
            streamId,
            getPartitionCount: async (streamId: StreamID) => {
                const stream = await this.streamRegistryCached.getStream(streamId)
                return stream.partitions
            },
            isPublicStream: (streamId: StreamID) => this.streamRegistryCached.isPublic(streamId),
            isPublisher: (streamId: StreamID, publisherId: EthereumAddress) => this.streamRegistryCached.isStreamPublisher(streamId, publisherId),
            createSignature: (payload: string) => this.authentication.createMessagePayloadSignature(payload),
            useGroupKey: () => queue.useGroupKey()
        })
    }

    async publish<T>(
        streamDefinition: StreamDefinition,
        content: T,
        metadata?: MessageMetadata
    ): Promise<StreamMessage<T>> {
        const timestamp = parseTimestamp(metadata)
        /*
         * There are some steps in the publish process which need to be done sequentially:
         * - message chaining
         * - consuming a group key from a queue
         * 
         * It is also good if messages are published to node in the same sequence, as that can avoid
         * unnecessary gap fills (if a subscriber would receive messages m1, m2, m3 in order m1, m3, m2
         * it would try to get m2 via a gap fill resend before it receives it normally).
         * 
         * Currently we limit that there can be only one publish task at any given time. That way
         * message chaining and group keys consuming is done properly. If we want to improve
         * concurrency, we could maybe offload message encryptions to a separate tasks which 
         * we'd execute in parallel.
         */
        return this.concurrencyLimit(async () => {
            const [ streamId, partition ] = await this.streamIdBuilder.toStreamPartElements(streamDefinition)
            try {
                const messageFactory = await this.messageFactories.get(streamId)
                const message = await messageFactory.createMessage(
                    content,
                    {
                        ...metadata,
                        timestamp
                    },
                    partition
                )
                await this.node.publishToNode(message)
                return message
            } catch (e) {
                throw new PublishError(streamId, timestamp, e)
            }
        })
    }

    getGroupKeyQueue(streamId: StreamID): Promise<GroupKeyQueue> {
        return this.groupKeyQueues.get(streamId)
    }
}
