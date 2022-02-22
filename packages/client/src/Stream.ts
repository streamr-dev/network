/**
 * Wrapper for Stream metadata and (some) methods.
 */
import { DependencyContainer, inject } from 'tsyringe'

import { until } from './utils'

import { Rest } from './Rest'
import Resends from './subscribe/Resends'
import Publisher from './publish/Publisher'
import { StreamRegistry } from './StreamRegistry'
import Ethereum from './Ethereum'
import { StorageNodeRegistry } from './StorageNodeRegistry'
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { EthereumAddress, StreamID, StreamMetadata } from 'streamr-client-protocol'
import { DEFAULT_PARTITION } from './StreamIDBuilder'
import { StrictStreamrClientConfig } from './ConfigBase'
import { Config } from './Config'
import { HttpFetcher } from './utils/HttpFetcher'
import { PermissionAssignment, PublicPermissionQuery, UserPermissionQuery } from './permission'

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
        @inject(BrubeckContainer) private _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.partitions = props.partitions ? props.partitions : 1
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        this._streamRegistry = _container.resolve<StreamRegistry>(StreamRegistry)
        this._nodeRegistry = _container.resolve<StorageNodeRegistry>(StorageNodeRegistry)
        this._ethereuem = _container.resolve<Ethereum>(Ethereum)
        this._httpFetcher = _container.resolve<HttpFetcher>(HttpFetcher)
        this._clientConfig = _container.resolve<StrictStreamrClientConfig>(Config.Root)
    }

    /**
     * Persist stream metadata updates.
     */
    async update() {
        try {
            await this._streamRegistry.updateStream(this.toObject())
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    toObject() : StreamProperties {
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
        this.config.fields = fields
        await this.update()
    }

    /**
     * @category Important
     */
    async addToStorageNode(nodeAddress: EthereumAddress, waitOptions: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        try {
            const storageNodeUrl = await this._nodeRegistry.getStorageNodeUrl(nodeAddress)
            await this._nodeRegistry.addStreamToStorageNode(this.id, nodeAddress)
            await this.waitUntilStorageAssigned(waitOptions, storageNodeUrl)
        } finally {
            this._streamEndpointsCached.clearStream(this.id)
        }
    }

    async waitUntilStorageAssigned({
        timeout,
        pollInterval
    }: {
        timeout?: number,
        pollInterval?: number
    } = {}, url: string) {
        // wait for propagation: the storage node sees the change and
        // is ready to store the any stream data which we publish
        await until(
            () => this.isStreamStoredInStorageNode(this.id, url),
            // eslint-disable-next-line no-underscore-dangle
            timeout ?? this._clientConfig._timeouts.storageNode.timeout,
            // eslint-disable-next-line no-underscore-dangle
            pollInterval ?? this._clientConfig._timeouts.storageNode.retryInterval,
            () => `Propagation timeout when adding stream to a storage node: ${this.id}`
        )
    }

    private async isStreamStoredInStorageNode(streamId: StreamID, nodeurl: string) {
        const url = `${nodeurl}/streams/${encodeURIComponent(streamId)}/storage/partitions/${DEFAULT_PARTITION}`
        const response = await this._httpFetcher.fetch(url)
        if (response.status === 200) {
            return true
        }
        if (response.status === 404) { // eslint-disable-line padding-line-between-statements
            return false
        }
        throw new Error(`Unexpected response code ${response.status} when fetching stream storage status`)
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
        return this._nodeRegistry.getStorageNodesOf(this.id)
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
}

export {
    StreamrStream as Stream
}
