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
import { StreamMetadata } from './StreamMessageValidator'

export interface StreamProperties {
    id: string
    description?: string
    config?: {
        fields: Field[]
    }
    partitions?: number
    storageDays?: number
    inactivityThresholdHours?: number
}

/** @internal */
export interface StreamrStreamConstructorOptions extends StreamProperties {
    id: StreamID
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
 * @category Important
 */
/* eslint-disable no-underscore-dangle */
class StreamrStream implements StreamMetadata {
    id: StreamID
    description?: string
    config: {
        fields: Field[]
    } = { fields: [] }
    partitions!: number
    storageDays?: number
    inactivityThresholdHours?: number
    private readonly resends: Resends
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly streamRegistry: StreamRegistry
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly timeoutsConfig: TimeoutsConfig

    /** @internal */
    constructor(
        props: StreamrStreamConstructorOptions,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        streamRegistryCached: StreamRegistryCached,
        streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        timeoutsConfig: TimeoutsConfig
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.partitions = props.partitions ? props.partitions : 1
        this.resends = resends
        this.publisher = publisher
        this.subscriber = subscriber
        this.streamRegistryCached = streamRegistryCached
        this.streamRegistry = streamRegistry
        this.streamStorageRegistry = streamStorageRegistry
        this.timeoutsConfig = timeoutsConfig
    }

    /**
     * Persist stream metadata updates.
     */
    async update(props: Omit<StreamProperties, 'id'>): Promise<void> {
        try {
            await this.streamRegistry.updateStream({
                ...this.toObject(),
                ...props,
                id: this.id
            })
        } finally {
            this.streamRegistryCached.clearStream(this.id)
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
            await this.streamRegistry.deleteStream(this.id)
        } finally {
            this.streamRegistryCached.clearStream(this.id)
        }
    }

    async detectFields(): Promise<void> {
        // Get last message of the stream to be used for field detecting
        const sub = await this.resends.resend(
            this.id,
            {
                last: 1,
            }
        )

        const receivedMsgs = await sub.collectContent()

        if (!receivedMsgs.length) { return }

        const [lastMessage] = receivedMsgs

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
            assignmentSubscription = await this.subscriber.subscribe(formStorageNodeAssignmentStreamId(normalizedNodeAddress))
            const propagationPromise = waitForAssignmentsToPropagate(assignmentSubscription, this)
            await this.streamStorageRegistry.addStreamToStorageNode(this.id, normalizedNodeAddress)
            await withTimeout(
                propagationPromise,
                // eslint-disable-next-line no-underscore-dangle
                waitOptions.timeout ?? this.timeoutsConfig.storageNode.timeout,
                'storage node did not respond'
            )
        } finally {
            this.streamRegistryCached.clearStream(this.id)
            await assignmentSubscription?.unsubscribe() // should never reject...
        }
    }

    /**
     * @category Important
     */
    async removeFromStorageNode(nodeAddress: string): Promise<void> {
        try {
            return this.streamStorageRegistry.removeStreamFromStorageNode(this.id, toEthereumAddress(nodeAddress))
        } finally {
            this.streamRegistryCached.clearStream(this.id)
        }
    }

    async getStorageNodes(): Promise<string[]> {
        return this.streamStorageRegistry.getStorageNodes(this.id)
    }

    /**
     * @category Important
     */
    async publish<T>(content: T, metadata?: MessageMetadata): Promise<StreamMessage<T>> {
        return this.publisher.publish(this.id, content, metadata)
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
        return this.streamRegistry.hasPermission({
            streamId: this.id,
            ...query
        })
    }

    /**
     * @category Important
     */
    async getPermissions(): Promise<PermissionAssignment[]> {
        return this.streamRegistry.getPermissions(this.id)
    }

    /**
     * @category Important
     */
    async grantPermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.grantPermissions(this.id, ...assignments)
    }

    /**
     * @category Important
     */
    async revokePermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this.streamRegistry.revokePermissions(this.id, ...assignments)
    }

}

export {
    StreamrStream as Stream
}
