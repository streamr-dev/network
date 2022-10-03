import { StreamID, StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject } from 'tsyringe'
import pMemoize from 'p-memoize'
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
import { CacheConfig, ConfigInjectionToken } from '../Config'
import { pLimitFn } from '../utils/promises'
import { inspect } from '../utils/log'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { GroupKeyQueue } from './GroupKeyQueue'

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
    private streamIdBuilder: StreamIDBuilder
    private authentication: Authentication
    private streamRegistryCached: StreamRegistryCached
    private node: NetworkNodeFacade
    private cacheConfig: CacheConfig
    private getMessageFactory: (streamId: StreamID) => Promise<MessageFactory>
    getGroupKeyQueue: (streamId: StreamID) => Promise<GroupKeyQueue>

    constructor(
        context: Context,
        streamIdBuilder: StreamIDBuilder,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        streamRegistryCached: StreamRegistryCached,
        groupKeyStore: GroupKeyStore,
        node: NetworkNodeFacade,
        @inject(ConfigInjectionToken.Cache) cacheConfig: CacheConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamIdBuilder = streamIdBuilder
        this.authentication = authentication
        this.streamRegistryCached = streamRegistryCached
        this.node = node
        this.cacheConfig = cacheConfig
        this.getMessageFactory = pLimitFn(pMemoize(async (streamId: StreamID) => {  // TODO is it better to use pMemoize or CacheAsyncFn (e.g. after revoked publish permissions?)
            return this.createMessageFactory(streamId)
        }, {
            cacheKey: ([streamId]) => streamId
        }))
        this.getGroupKeyQueue = pMemoize(async (streamId: StreamID) => {
            return new GroupKeyQueue(streamId, groupKeyStore)
        }, {
            cacheKey: ([streamId]) => streamId
        })
    }

    private async createMessageFactory(streamId: StreamID): Promise<MessageFactory> {
        const [ stream, authenticatedUser ] = await Promise.all([
            this.streamRegistryCached.getStream(streamId),
            this.authentication.getAddress()
        ])
        const isPublisher = await this.streamRegistryCached.isStreamPublisher(streamId, authenticatedUser)
        if (!isPublisher) {
            throw new Error(`${authenticatedUser} is not a publisher on stream ${streamId}`)
        }
        const isPublicStream = await this.streamRegistryCached.isPublic(streamId)
        return new MessageFactory({
            streamId,
            partitionCount: stream.partitions,
            isPublicStream,
            publisherId: authenticatedUser.toLowerCase(),
            createSignature: (payload: string) => this.authentication.createMessagePayloadSignature(payload),
            useGroupKey: async () => {
                const queue = await this.getGroupKeyQueue(streamId)
                return queue.useGroupKey()
            },
            cacheConfig: this.cacheConfig
        })
    }

    async publish<T>(
        streamDefinition: StreamDefinition,
        content: T,
        metadata?: MessageMetadata
    ): Promise<StreamMessage<T>> {
        const timestamp = parseTimestamp(metadata)
        const [ streamId, partition ] = await this.streamIdBuilder.toStreamPartElements(streamDefinition)
        try {
            const messageFactory = await this.getMessageFactory(streamId)
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
    }
}
