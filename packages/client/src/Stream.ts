/**
 * Wrapper for Stream metadata and (some) methods.
 */
import { Resends } from './subscribe/Resends'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import {
    StreamID,
    StreamMessage,
    StreamPartID,
    toStreamPartID
} from 'streamr-client-protocol'
import { range } from 'lodash'
import { TimeoutsConfig } from './Config'
import { PermissionAssignment, PublicPermissionQuery, UserPermissionQuery } from './permission'
import { Subscriber } from './subscribe/Subscriber'
import { formStorageNodeAssignmentStreamId } from './utils/utils'
import { waitForAssignmentsToPropagate } from './utils/waitForAssignmentsToPropagate'
import { MessageMetadata } from '../src/publish/Publisher'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { toEthereumAddress, withTimeout } from '@streamr/utils'
import { StreamrClientEventEmitter } from './events'
import { collect } from './utils/iterators'
import { DEFAULT_PARTITION } from './StreamIDBuilder'
import { Subscription } from './subscribe/Subscription'
import { LoggerFactory } from './utils/LoggerFactory'

export interface StreamMetadata {
    partitions?: number
    description?: string
    config?: {
        fields: Field[]
    }
    storageDays?: number
    inactivityThresholdHours?: number
}

export type StreamProperties = StreamMetadata & { id: string }

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
 * @category Important
 */
/* eslint-disable no-underscore-dangle */
class StreamrStream {
    id: StreamID
    description?: string
    config: {
        fields: Field[]
    } = { fields: [] }
    partitions!: number
    storageDays?: number
    inactivityThresholdHours?: number
    private readonly _resends: Resends
    private readonly _publisher: Publisher
    private readonly _subscriber: Subscriber
    private readonly _streamRegistry: StreamRegistry
    private readonly _streamRegistryCached: StreamRegistryCached
    private readonly _streamStorageRegistry: StreamStorageRegistry
    private readonly _loggerFactory: LoggerFactory
    private readonly _eventEmitter: StreamrClientEventEmitter
    private readonly _timeoutsConfig: TimeoutsConfig

    /** @internal */
    constructor(
        id: StreamID,
        metadata: StreamMetadata,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        streamRegistryCached: StreamRegistryCached,
        streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        loggerFactory: LoggerFactory,
        eventEmitter: StreamrClientEventEmitter,
        timeoutsConfig: TimeoutsConfig
    ) {
        Object.assign(this, metadata)
        this.id = id
        this.partitions = metadata.partitions ? metadata.partitions : 1
        this._resends = resends
        this._publisher = publisher
        this._subscriber = subscriber
        this._streamRegistryCached = streamRegistryCached
        this._streamRegistry = streamRegistry
        this._streamStorageRegistry = streamStorageRegistry
        this._loggerFactory = loggerFactory
        this._eventEmitter = eventEmitter
        this._timeoutsConfig = timeoutsConfig
    }

    /**
     * Persist stream metadata updates.
     */
    async update(props: Omit<StreamProperties, 'id'>): Promise<void> {
        try {
            await this._streamRegistry.updateStream({
                ...this.toObject(),
                ...props,
                id: this.id
            })
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
        for (const key of Object.keys(props)) {
            (this as any)[key] = (props as any)[key]
        }
    }

    getStreamParts(): StreamPartID[] {
        return range(0, this.partitions).map((p) => toStreamPartID(this.id, p))
    }

    toObject(): StreamProperties {
        const result: any = {}
        Object.keys(this).forEach((key) => {
            if (key.startsWith('_') || typeof key === 'function') { return }
            result[key] = (this as any)[key]
        })
        return result as StreamProperties
    }

    async delete(): Promise<void> {
        try {
            await this._streamRegistry.deleteStream(this.id)
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
    }

    async detectFields(): Promise<void> {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.last<any>(
            toStreamPartID(this.id, DEFAULT_PARTITION),
            {
                count: 1,
            }
        )

        const receivedMsgs = await collect(sub)

        if (!receivedMsgs.length) { return }

        const lastMessage = receivedMsgs[0].getParsedContent()

        const fields = Object.entries(lastMessage).map(([name, value]) => {
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
     * @category Important
     */
    async addToStorageNode(nodeAddress: string, waitOptions: { timeout?: number } = {}): Promise<void> {
        let assignmentSubscription
        const normalizedNodeAddress = toEthereumAddress(nodeAddress)
        try {
            const streamPartId = toStreamPartID(formStorageNodeAssignmentStreamId(normalizedNodeAddress), DEFAULT_PARTITION)
            assignmentSubscription = new Subscription<any>(streamPartId, this._loggerFactory)
            await this._subscriber.add(assignmentSubscription)
            const propagationPromise = waitForAssignmentsToPropagate(assignmentSubscription, this)
            await this._streamStorageRegistry.addStreamToStorageNode(this.id, normalizedNodeAddress)
            await withTimeout(
                propagationPromise,
                // eslint-disable-next-line no-underscore-dangle
                waitOptions.timeout ?? this._timeoutsConfig.storageNode.timeout,
                'storage node did not respond'
            )
        } finally {
            this._streamRegistryCached.clearStream(this.id)
            await assignmentSubscription?.unsubscribe() // should never reject...
        }
    }

    /**
     * @category Important
     */
    async removeFromStorageNode(nodeAddress: string): Promise<void> {
        try {
            return this._streamStorageRegistry.removeStreamFromStorageNode(this.id, toEthereumAddress(nodeAddress))
        } finally {
            this._streamRegistryCached.clearStream(this.id)
        }
    }

    async getStorageNodes(): Promise<string[]> {
        return this._streamStorageRegistry.getStorageNodes(this.id)
    }

    /**
     * @category Important
     */
    async publish<T>(content: T, metadata?: MessageMetadata): Promise<StreamMessage<T>> {
        const result = this._publisher.publish(this.id, content, metadata)
        this._eventEmitter.emit('publish', undefined)
        return result

    }

    /** @internal */
    static parsePropertiesFromMetadata(propsString: string): StreamProperties {
        try {
            return JSON.parse(propsString)
        } catch (error) {
            throw new Error(`Could not parse properties from onchain metadata: ${propsString}`)
        }
    }

    /**
     * @category Important
     */
    async hasPermission(query: Omit<UserPermissionQuery, 'streamId'> | Omit<PublicPermissionQuery, 'streamId'>): Promise<boolean> {
        return this._streamRegistry.hasPermission({
            streamId: this.id,
            ...query
        })
    }

    /**
     * @category Important
     */
    async getPermissions(): Promise<PermissionAssignment[]> {
        return this._streamRegistry.getPermissions(this.id)
    }

    /**
     * @category Important
     */
    async grantPermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this._streamRegistry.grantPermissions(this.id, ...assignments)
    }

    /**
     * @category Important
     */
    async revokePermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this._streamRegistry.revokePermissions(this.id, ...assignments)
    }

}

export {
    StreamrStream as Stream
}
