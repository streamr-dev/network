import {
    DEFAULT_PARTITION_COUNT,
    HexString,
    StreamID,
    StreamPartID,
    collect,
    ensureValidStreamPartitionCount,
    merge, toEthereumAddress,
    toStreamPartID,
    withTimeout
} from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import range from 'lodash/range'
import { PublishMetadata, Publisher } from '../src/publish/Publisher'
import { StrictStreamrClientConfig } from './Config'
import { Message, convertStreamMessageToMessage } from './Message'
import { DEFAULT_PARTITION } from './StreamIDBuilder'
import { StreamrClientError } from './StreamrClientError'
import { StreamRegistry } from './contracts/StreamRegistry'
import { StreamStorageRegistry } from './contracts/StreamStorageRegistry'
import { StreamrClientEventEmitter } from './events'
import {
    PermissionAssignment,
    PublicPermissionQuery,
    UserPermissionQuery,
    toInternalPermissionAssignment,
    toInternalPermissionQuery
} from './permission'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { Subscription, SubscriptionEvents } from './subscribe/Subscription'
import { LoggerFactory } from './utils/LoggerFactory'
import { formStorageNodeAssignmentStreamId } from './utils/utils'
import { waitForAssignmentsToPropagate } from './utils/waitForAssignmentsToPropagate'
import { isNumber, isString } from 'lodash'

export type StreamMetadata = Record<string, unknown>

const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

interface Field {
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
        case (VALID_FIELD_TYPES as readonly string[]).includes(type): {
            // see https://github.com/microsoft/TypeScript/issues/36275
            return type as Field['type']
        }
        default: {
            return undefined
        }
    }
}

export const flatMerge = <TTarget>(...sources: (Partial<TTarget> | undefined)[]): TTarget => {
    const result: Record<string, unknown> = {}
    for (const source of sources) {
        if (source !== undefined) {
            for (const [key, value] of Object.entries(source)) {
                if (value !== undefined) {
                    result[key] = value
                }
            }
        }
    }
    return result as TTarget
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
    private readonly _publisher: Publisher
    private readonly _subscriber: Subscriber
    private readonly _resends: Resends
    private readonly _streamRegistry: StreamRegistry
    private readonly _streamStorageRegistry: StreamStorageRegistry
    private readonly _loggerFactory: LoggerFactory
    private readonly _eventEmitter: StreamrClientEventEmitter
    private readonly _config: Pick<StrictStreamrClientConfig, '_timeouts'>

    /** @internal */
    constructor(
        id: StreamID,
        metadata: StreamMetadata,
        publisher: Publisher,
        subscriber: Subscriber,
        resends: Resends,
        streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        loggerFactory: LoggerFactory,
        eventEmitter: StreamrClientEventEmitter,
        config: Pick<StrictStreamrClientConfig, '_timeouts'>
    ) {
        this.id = id
        this.metadata = merge(
            {
                partitions: DEFAULT_PARTITION_COUNT,
                // TODO should we remove this default or make config as a required StreamMetadata field?
                config: {
                    fields: []
                }
            },
            metadata
        )
        this._publisher = publisher
        this._subscriber = subscriber
        this._resends = resends
        this._streamRegistry = streamRegistry
        this._streamStorageRegistry = streamStorageRegistry
        this._loggerFactory = loggerFactory
        this._eventEmitter = eventEmitter
        this._config = config
    }

    /**
     * Updates the metadata of the stream.
     */
    async update(metadata: StreamMetadata): Promise<void> {
        try {
            await this._streamRegistry.updateStream(this.id, metadata)
        } finally {
            this._streamRegistry.clearStreamCache(this.id)
        }
        this.metadata = metadata
    }

    /**
     * Returns the partitions of the stream.
     */
    getStreamParts(): StreamPartID[] {
        return range(0, this.getPartitionCount()).map((p) => toStreamPartID(this.id, p))
    }

    getPartitionCount(): number {
        const metadataValue = this.getMetadata().partitions as number | undefined
        if (metadataValue !== undefined) {
            ensureValidStreamPartitionCount(metadataValue)
        }
        return metadataValue ?? DEFAULT_PARTITION_COUNT
    }

    getDescription(): string | undefined {
        const value = this.getMetadata().description
        if (isString(value)) {
            return value
        } else {
            return undefined
        }
    }

    async setDescription(description: string): Promise<void> {
        await this.update({
            ...this.getMetadata(),
            description
        })
    }

    /**
     * Gets the value of `storageDays` field
     */
    getStorageDayCount(): number | undefined {
        const value = this.getMetadata().storageDays
        if (isNumber(value)) {
            return value
        } else {
            return undefined
        }
    }

    /**
     * Sets the value of `storageDays` field
     */
    async setStorageDayCount(count: number): Promise<void> {
        await this.update({
            ...this.getMetadata(),
            storageDays: count
        })
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
            this._streamRegistry.clearStreamCache(this.id)
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
        const sub = await this._resends.resend(
            toStreamPartID(this.id, DEFAULT_PARTITION),
            {
                last: 1
            },
            (streamId: StreamID) => this._streamStorageRegistry.getStorageNodes(streamId)
        )

        const receivedMsgs = await collect(sub)

        if (!receivedMsgs.length) { return }

        const lastMessage = receivedMsgs[0].getParsedContent()

        const fields = Object.entries(lastMessage as any).map(([name, value]) => {
            const type = getFieldType(value)
            return !!type && {
                name,
                type,
            }
        }).filter(Boolean) as Field[] // see https://github.com/microsoft/TypeScript/issues/30621

        // Save field config back to the stream
        const merged = flatMerge(this.getMetadata(), {
            config: {
                fields
            }
        })
        await this.update(merged)
    }

    /**
     * Assigns the stream to a storage node.
     *
     * @category Important
     *
     * @param opts - control how long to wait for storage node to pick up on assignment
     * @returns If opts.wait=true, the promise resolves when the storage node acknowledges the assignment and
     * is therefore ready to store published messages. If we don't receive the acknowledgment within the `timeout`,
     * the promise rejects, but the assignment may still succeed later.
     */
    async addToStorageNode(storageNodeAddress: HexString, opts: { wait: boolean, timeout?: number } = { wait: false }): Promise<void> {
        const normalizedNodeAddress = toEthereumAddress(storageNodeAddress)
        if (opts.wait) {
            // check whether the stream is already stored: the assignment event listener logic requires that
            // there must not be an existing assignment (it timeouts if there is an existing assignment as the
            // storage node doesn't send an assignment event in that case)
            const isAlreadyStored = await this._streamStorageRegistry.isStoredStream(this.id, normalizedNodeAddress)
            if (isAlreadyStored) {
                return
            }
            let assignmentSubscription
            try {
                const streamPartId = toStreamPartID(formStorageNodeAssignmentStreamId(normalizedNodeAddress), DEFAULT_PARTITION)
                assignmentSubscription = new Subscription(
                    streamPartId,
                    false,
                    undefined,
                    new EventEmitter<SubscriptionEvents>(),
                    this._loggerFactory
                )
                await this._subscriber.add(assignmentSubscription)
                const propagationPromise = waitForAssignmentsToPropagate(assignmentSubscription, {
                    id: this.id,
                    partitions: this.getPartitionCount()
                }, this._loggerFactory)
                await this._streamStorageRegistry.addStreamToStorageNode(this.id, normalizedNodeAddress)
                await withTimeout(
                    propagationPromise,
                    opts.timeout ?? this._config._timeouts.storageNode.timeout,
                    'storage node did not respond'
                )
            } finally {
                this._streamRegistry.clearStreamCache(this.id)
                await assignmentSubscription?.unsubscribe() // should never reject...
            }
        } else {
            await this._streamStorageRegistry.addStreamToStorageNode(this.id, normalizedNodeAddress)
        }
    }

    /**
     * See {@link StreamrClient.removeStreamFromStorageNode | StreamrClient.removeStreamFromStorageNode}.
     */
    async removeFromStorageNode(nodeAddress: HexString): Promise<void> {
        try {
            return this._streamStorageRegistry.removeStreamFromStorageNode(this.id, toEthereumAddress(nodeAddress))
        } finally {
            this._streamRegistry.clearStreamCache(this.id)
        }
    }

    /**
     * See {@link StreamrClient.getStorageNodes | StreamrClient.getStorageNodes}.
     */
    async getStorageNodes(): Promise<HexString[]> {
        return this._streamStorageRegistry.getStorageNodes(this.id)
    }

    /**
     * See {@link StreamrClient.publish | StreamrClient.publish}.
     *
     * @category Important
     */
    async publish(content: unknown, metadata?: PublishMetadata): Promise<Message> {
        const result = await this._publisher.publish(this.id, content, metadata)
        this._eventEmitter.emit('messagePublished', result)
        return convertStreamMessageToMessage(result)
    }

    /** @internal */
    static parseMetadata(metadata: string): StreamMetadata {
        // TODO we could pick the fields of StreamMetadata explicitly, so that this
        // object can't contain extra fields
        if (metadata === '') {
            return {
                partitions: DEFAULT_PARTITION_COUNT
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
                partitions: DEFAULT_PARTITION_COUNT
            }
        }
    }

    /**
     * See {@link StreamrClient.hasPermission | StreamrClient.hasPermission}.
     *
     * @category Important
     */
    async hasPermission(query: Omit<UserPermissionQuery, 'streamId'> | Omit<PublicPermissionQuery, 'streamId'>): Promise<boolean> {
        return this._streamRegistry.hasPermission(toInternalPermissionQuery({
            streamId: this.id,
            ...query
        }))
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
        return this._streamRegistry.grantPermissions(this.id, ...assignments.map(toInternalPermissionAssignment))
    }

    /**
     * See {@link StreamrClient.revokePermissions | StreamrClient.revokePermissions}.
     *
     * @category Important
     */
    async revokePermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this._streamRegistry.revokePermissions(this.id, ...assignments.map(toInternalPermissionAssignment))
    }

}
