/**
 * Wrapper for Stream metadata and (some) methods.
 */
import { DependencyContainer, inject } from 'tsyringe'

import { inspect } from './utils/log'

import { Rest } from './Rest'
import Resends from './subscribe/Resends'
import Publisher from './publish/Publisher'
import { StreamRegistry } from './StreamRegistry'
import { Ethereum } from './Ethereum'
import { StorageNodeRegistry } from './StorageNodeRegistry'
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import {
    EthereumAddress,
    StreamID,
    StreamMetadata,
    StreamPartID,
    toStreamPartID
} from 'streamr-client-protocol'
import { range } from 'lodash'
import { StrictStreamrClientConfig, ConfigInjectionToken } from './Config'
import { HttpFetcher } from './utils/HttpFetcher'
import { PermissionAssignment, PublicPermissionQuery, UserPermissionQuery } from './permission'
import Subscriber from './subscribe/Subscriber'
import { formStorageNodeAssignmentStreamId, withTimeout } from './utils'
import { waitForAssignmentsToPropagate } from './utils/waitForAssignmentsToPropagate'

export interface StreamProperties {
    id: string
    description?: string
    config?: {
        fields: Field[];
    }
    partitions?: number
    requireSignedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number
}

/** @internal */
export interface StreamrStreamConstructorOptions extends StreamProperties {
    id: StreamID
}

export const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

export type Field = {
    name: string;
    type: typeof VALID_FIELD_TYPES[number];
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
class StreamrStream implements StreamMetadata {
    id: StreamID
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions!: number
    requireSignedData!: boolean
    storageDays?: number
    inactivityThresholdHours?: number
    protected _rest: Rest
    protected _resends: Resends
    protected _publisher: Publisher
    protected _subscriber: Subscriber
    protected _streamEndpoints: StreamEndpoints
    protected _streamEndpointsCached: StreamEndpointsCached
    protected _streamRegistry: StreamRegistry
    protected _nodeRegistry: StorageNodeRegistry
    protected _ethereuem: Ethereum
    private readonly _httpFetcher: HttpFetcher
    private _clientConfig: StrictStreamrClientConfig

    /** @internal */
    constructor(
        props: StreamrStreamConstructorOptions,
        @inject(BrubeckContainer) _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.partitions = props.partitions ? props.partitions : 1
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
        this._subscriber = _container.resolve<Subscriber>(Subscriber)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        this._streamRegistry = _container.resolve<StreamRegistry>(StreamRegistry)
        this._nodeRegistry = _container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this._ethereuem = _container.resolve<Ethereum>(Ethereum)
        this._httpFetcher = _container.resolve<HttpFetcher>(HttpFetcher)
        this._clientConfig = _container.resolve<StrictStreamrClientConfig>(ConfigInjectionToken.Root)
    }

    /**
     * Persist stream metadata updates.
     */
    async update(props: Omit<StreamProperties, 'id'>) {
        try {
            await this._streamRegistry.updateStream({
                ...this.toObject(),
                ...props,
                id: this.id
            })
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
        for (const key of Object.keys(props)) {
            // @ts-expect-error
            this[key] = props[key]
        }
    }

    getStreamParts(): StreamPartID[] {
        return range(0, this.partitions).map((p) => toStreamPartID(this.id, p))
    }

    toObject(): StreamProperties {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (key.startsWith('_') || typeof key === 'function') { return }
            // @ts-expect-error
            result[key] = this[key]
        })
        return result as StreamProperties
    }

    async delete() {
        try {
            await this._streamRegistry.deleteStream(this.id)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.resend(
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
    async addToStorageNode(nodeAddress: EthereumAddress, waitOptions: { timeout?: number } = {}) {
        let assignmentSubscription
        try {
            assignmentSubscription = await this._subscriber.subscribe(formStorageNodeAssignmentStreamId(nodeAddress))
            const propagationPromise = waitForAssignmentsToPropagate(assignmentSubscription, this)
            await this._nodeRegistry.addStreamToStorageNode(this.id, nodeAddress)
            await withTimeout(
                propagationPromise,
                // eslint-disable-next-line no-underscore-dangle
                waitOptions.timeout ?? this._clientConfig._timeouts.storageNode.timeout,
                'timed out waiting for storage nodes to respond'
            )
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
            await assignmentSubscription?.unsubscribe() // should never reject...
        }
    }

    /**
     * @category Important
     */
    async removeFromStorageNode(nodeAddress: EthereumAddress) {
        try {
            return this._nodeRegistry.removeStreamFromStorageNode(this.id, nodeAddress)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async getStorageNodes() {
        return this._nodeRegistry.getStorageNodes(this.id)
    }

    /**
     * @category Important
     */
    async publish<T>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
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

    [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: any) {
        return inspect(this.toObject(), {
            ...options,
            customInspect: false,
            depth,
        })
    }
}

export {
    StreamrStream as Stream
}
