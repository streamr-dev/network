import { Resends } from './subscribe/Resends'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import {
    StreamID,
    StreamPartID,
    toStreamPartID,
    ensureValidStreamPartitionCount
} from '@streamr/protocol'
import range from 'lodash/range'
import { StrictStreamrClientConfig } from './Config'
import { PermissionAssignment, PublicPermissionQuery, UserPermissionQuery } from './permission'
import { Subscriber } from './subscribe/Subscriber'
import { formStorageNodeAssignmentStreamId } from './utils/utils'
import { waitForAssignmentsToPropagate } from './utils/waitForAssignmentsToPropagate'
import { PublishMetadata } from '../src/publish/Publisher'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { toEthereumAddress, withTimeout } from '@streamr/utils'
import { StreamrClientEventEmitter } from './events'
import { collect } from './utils/iterators'
import { DEFAULT_PARTITION } from './StreamIDBuilder'
import { Subscription } from './subscribe/Subscription'
import { LoggerFactory } from './utils/LoggerFactory'
import { Message } from './Message'
import { convertStreamMessageToMessage } from './Message'
import { merge } from '@streamr/utils'
import { StreamrClientError } from './StreamrClientError' 

export interface StreamMetadata {
    /**
     * Determines how many partitions this stream consist of.
     */
    partitions: number

    /**
     * Human-readable description of this stream.
     */
    description?: string

    /**
     * Defines the structure of the content (payloads) of messages in this stream.
     *
     * @remarks Not validated, purely for informational value.
     */
    config?: {
        fields: Field[]
    }

    /**
     * If this stream is assigned to storage nodes, how many days (at minimum) should the data be retained for.
     */
    storageDays?: number

    /**
     * After how many hours of inactivity (i.e. no messages) should a stream be considered inactive. Purely for
     * informational purposes.
     */
    inactivityThresholdHours?: number
}

export const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

export interface Field {
    name: string
    type: typeof VALID_FIELD_TYPES[number]
}

function getFieldType(value: any): (Field['type'] | undefined) {
    const type = typeof value
    switch (true) {
        case Array.isArray(value): {
            return 'list'
        }
        case type === 'object': {
            return 'map'
        }
        case (VALID_FIELD_TYPES as ReadonlyArray<string>).includes(type): {
            // see https://github.com/microsoft/TypeScript/issues/36275
            return type as Field['type']
        }
        default: {
            return undefined
        }
    }
}

/**
 * A convenience API for managing and accessing an individual stream.
 *
 * @category Important
 */
/* eslint-disable no-underscore-dangle */
export class Stream {
    readonly id: StreamID
    private metadata: StreamMetadata
    private readonly _resends: Resends
    private readonly _publisher: Publisher
    private readonly _subscriber: Subscriber
    private readonly _streamRegistry: StreamRegistry
    private readonly _streamRegistryCached: StreamRegistryCached
    private readonly _streamStorageRegistry: StreamStorageRegistry
    private readonly _loggerFactory: LoggerFactory
    private readonly _eventEmitter: StreamrClientEventEmitter
    private readonly _config: Pick<StrictStreamrClientConfig, '_timeouts'>

    /** @internal */
    constructor(
        id: StreamID,
        metadata: Partial<StreamMetadata>,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        streamRegistryCached: StreamRegistryCached,
        streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        loggerFactory: LoggerFactory,
        eventEmitter: StreamrClientEventEmitter,
        config: Pick<StrictStreamrClientConfig, '_timeouts'>
    ) {
        this.id = id
        this.metadata = merge(
            {
                partitions: 1,
                // TODO should we remove this default or make config as a required StreamMetadata field?
                config: {
                    fields: []
                }
            },
            metadata
        )
        this._resends = resends
        this._publisher = publisher
        this._subscriber = subscriber
        this._streamRegistryCached = streamRegistryCached
        this._streamRegistry = streamRegistry
        this._streamStorageRegistry = streamStorageRegistry
        this._loggerFactory = loggerFactory
        this._eventEmitter = eventEmitter
        this._config = config
    }

    /**
     * Updates the metadata of the stream by merging with the existing metadata.
     */
    async update(metadata: Partial<StreamMetadata>): Promise<void> {
        const merged = merge(this.getMetadata(), metadata)
        try {
            await this._streamRegistry.updateStream(this.id, merged)
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
        this.metadata = merged
    }

    /**
     * Returns the partitions of the stream.
     */
    getStreamParts(): StreamPartID[] {
        return range(0, this.getMetadata().partitions).map((p) => toStreamPartID(this.id, p))
    }

    /**
     * Returns the metadata of the stream.
     */
    getMetadata(): StreamMetadata {
        return this.metadata
    }

    /**
     * Deletes the stream.
     *
     * @remarks Stream instance should not be used afterwards.
     */
    async delete(): Promise<void> {
        try {
            await this._streamRegistry.deleteStream(this.id)
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
    }

    /**
     * Attempts to detect and update the {@link StreamMetadata.config} metadata of the stream by performing a resend.
     *
     * @remarks Only works on stored streams.
     *
     * @returns be mindful that in the case of there being zero messages stored, the returned promise will resolve even
     * though fields were not updated
     */
    async detectFields(): Promise<void> {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.last(
            toStreamPartID(this.id, DEFAULT_PARTITION),
            {
                count: 1,
            }
        )

        const receivedMsgs = await collect(sub)

        if (!receivedMsgs.length) { return }

        const lastMessage = receivedMsgs[0].content

        const fields = Object.entries(lastMessage as any).map(([name, value]) => {
            const type = getFieldType(value)
            return !!type && {
                name,
                type,
            }
        }).filter(Boolean) as Field[] // see https://github.com/microsoft/TypeScript/issues/30621

        // Save field config back to the stream
        await this.update({
            config: {
                fields
            }
        })
    }

    /**
     * Assigns the stream to a storage node.
     *
     * @category Important
     *
     * @param waitOptions - control how long to wait for storage node to pick up on assignment
     * @returns a resolved promise if (1) stream was assigned to storage node and (2) the storage node acknowledged the
     * assignment within `timeout`, otherwise rejects. Notice that is possible for this promise to reject but for the
     * storage node assignment to go through eventually.
     */
    async addToStorageNode(storageNodeAddress: string, waitOptions: { timeout?: number } = {}): Promise<void> {
        let assignmentSubscription
        const normalizedNodeAddress = toEthereumAddress(storageNodeAddress)
        try {
            const streamPartId = toStreamPartID(formStorageNodeAssignmentStreamId(normalizedNodeAddress), DEFAULT_PARTITION)
            assignmentSubscription = new Subscription(streamPartId, false, this._loggerFactory)
            await this._subscriber.add(assignmentSubscription)
            const propagationPromise = waitForAssignmentsToPropagate(assignmentSubscription, {
                id: this.id,
                partitions: this.getMetadata().partitions
            })
            await this._streamStorageRegistry.addStreamToStorageNode(this.id, normalizedNodeAddress)
            await withTimeout(
                propagationPromise,
                // eslint-disable-next-line no-underscore-dangle
                waitOptions.timeout ?? this._config._timeouts.storageNode.timeout,
                'storage node did not respond'
            )
        } finally {
            this._streamRegistryCached.clearStream(this.id)
            await assignmentSubscription?.unsubscribe() // should never reject...
        }
    }

    /**
     * See {@link StreamrClient.removeStreamFromStorageNode | StreamrClient.removeStreamFromStorageNode}.
     */
    async removeFromStorageNode(nodeAddress: string): Promise<void> {
        try {
            return this._streamStorageRegistry.removeStreamFromStorageNode(this.id, toEthereumAddress(nodeAddress))
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
    }

    /**
     * See {@link StreamrClient.getStorageNodes | StreamrClient.getStorageNodes}.
     */
    async getStorageNodes(): Promise<string[]> {
        return this._streamStorageRegistry.getStorageNodes(this.id)
    }

    /**
     * See {@link StreamrClient.publish | StreamrClient.publish}.
     *
     * @category Important
     */
    async publish(content: unknown, metadata?: PublishMetadata): Promise<Message> {
        const result = await this._publisher.publish(this.id, content, metadata)
        this._eventEmitter.emit('publish', undefined)
        return convertStreamMessageToMessage(result)
    }

    /** @internal */
    static parseMetadata(metadata: string): StreamMetadata {
        // TODO we could pick the fields of StreamMetadata explicitly, so that this
        // object can't contain extra fields
        if (metadata === '') {
            return {
                partitions: 1
            }
        }
        const err = new StreamrClientError(`Invalid stream metadata: ${metadata}`, 'INVALID_STREAM_METADATA')
        let json
        try {
            json = JSON.parse(metadata)
        } catch (_ignored) {
            throw err
        }
        if (json.partitions !== undefined) {
            try {
                ensureValidStreamPartitionCount(json.partitions)
                return json
            } catch (_ignored) {
                throw err
            }
        } else {
            return {
                ...json,
                partitions: 1
            }
        }
    }

    /**
     * See {@link StreamrClient.hasPermission | StreamrClient.hasPermission}.
     *
     * @category Important
     */
    async hasPermission(query: Omit<UserPermissionQuery, 'streamId'> | Omit<PublicPermissionQuery, 'streamId'>): Promise<boolean> {
        return this._streamRegistry.hasPermission({
            streamId: this.id,
            ...query
        })
    }

    /**
     * See {@link StreamrClient.getPermissions | StreamrClient.getPermissions}.
     *
     * @category Important
     */
    async getPermissions(): Promise<PermissionAssignment[]> {
        return this._streamRegistry.getPermissions(this.id)
    }

    /**
     * See {@link StreamrClient.grantPermissions | StreamrClient.grantPermissions}.
     *
     * @category Important
     */
    async grantPermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this._streamRegistry.grantPermissions(this.id, ...assignments)
    }

    /**
     * See {@link StreamrClient.revokePermissions | StreamrClient.revokePermissions}.
     *
     * @category Important
     */
    async revokePermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this._streamRegistry.revokePermissions(this.id, ...assignments)
    }

}
