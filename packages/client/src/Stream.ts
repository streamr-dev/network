import { MessageContent } from 'streamr-client-protocol'
import { DependencyContainer } from 'tsyringe'

export { GroupKey } from './encryption/Encryption'
import { EthereumAddress } from './types'

import { Rest } from './Rest'
import Resends from './Resends'
import Publisher from './Publisher'
import { BigNumber } from '@ethersproject/bignumber'
import { StreamMetadata } from '../../protocol/dist/src/utils/StreamMessageValidator'
import { StreamRegistry } from './StreamRegistry'
import Ethereum from './Ethereum'
import { NodeRegistry } from './NodeRegistry'
import { BrubeckContainer } from './Container'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'

// TODO explicit types: e.g. we never provide both streamId and id, or both streamPartition and partition
export type StreamPartDefinitionOptions = {
    streamId?: string,
    streamPartition?: number,
    id?: string,
    partition?: number,
    stream?: StreamrStream|string
}

export type StreamPartDefinition = string | StreamPartDefinitionOptions

export type ValidatedStreamPartDefinition = { streamId: string, streamPartition: number, key: string}

export interface StreamPermission {
    streamId: string
    userAddress: string
    edit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    share: boolean
}

export enum StreamOperation {
    // STREAM_GET = 'stream_get',
    STREAM_EDIT = 'edit',
    STREAM_DELETE = 'canDelete',
    STREAM_PUBLISH = 'publishExpiration',
    STREAM_SUBSCRIBE = 'subscribeExpiration',
    STREAM_SHARE = 'share'
}

export interface StreamProperties {
    id: string
    name?: string
    description?: string
    config?: {
        fields: Field[];
    }
    partitions?: number
    requireSignedData?: boolean
    requireEncryptedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number
}

const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

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

class StreamrStream implements StreamMetadata {
    streamId: string
    id: string
    // @ts-expect-error
    name: string
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions!: number
    /** @internal */
    requireEncryptedData!: boolean
    requireSignedData!: boolean
    storageDays?: number
    inactivityThresholdHours?: number
    protected _rest: Rest
    protected _resends: Resends
    protected _publisher: Publisher
    protected _streamEndpoints: StreamEndpoints
    protected _streamEndpointsCached: StreamEndpointsCached
    protected _streamRegistry: StreamRegistry
    protected _nodeRegistry: NodeRegistry
    protected _ethereuem: Ethereum

    constructor(
        props: StreamProperties,
        @inject(BrubeckContainer) private _container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.streamId = this.id
        this._rest = container.resolve<Rest>(Rest)
        this._resends = container.resolve<Resends>(Resends)
        this._publisher = container.resolve<Publisher>(Publisher)
        this._streamEndpoints = _container.resolve<StreamEndpoints>(StreamEndpoints)
        this._streamEndpointsCached = _container.resolve<StreamEndpointsCached>(StreamEndpointsCached)
        this._streamRegistry = container.resolve<StreamRegistry>(StreamRegistry)
        this._nodeRegistry = container.resolve<NodeRegistry>(NodeRegistry)
        this._nodeRegistry = container.resolve<NodeRegistry>(NodeRegistry)
        this._ethereuem = container.resolve<Ethereum>(Ethereum)
    }

    async update() {
        await this._streamRegistry.updateStream(this.toObject())
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

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._resends.resend({
            streamId: this.id,
            resend: {
                last: 1,
            },
        })

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

    async delete() {
        await this._streamRegistry.deleteStream(this.id)
    }

    async getPermissions() {
        return this._streamRegistry.getAllPermissionsForStream(this.id)
    }

    async getMyPermissions() {
        return this._streamRegistry.getPermissionsForUser(this.id, await this._ethereuem.getAddress())
    }

    async hasPermission(operation: StreamOperation, userId: EthereumAddress) {
        // eth addresses may be in checksumcase, but userId from server has no case

        // const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this._streamRegistry.getPermissionsForUser(this.id, userId)

        if (operation === StreamOperation.STREAM_PUBLISH || operation === StreamOperation.STREAM_SUBSCRIBE) {
            return permissions[operation].gt(Date.now())
        }
        return permissions[operation]
    }

    async grantPermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._streamRegistry.grantPermission(this.id, operation, recipientId.toLowerCase())
    }

    async grantPublicPermission(operation: StreamOperation) {
        await this._streamRegistry.grantPublicPermission(this.id, operation)
    }

    async revokePermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._streamRegistry.revokePermission(this.id, operation, recipientId.toLowerCase())
    }

    async revokePublicPermission(operation: StreamOperation) {
        await this._streamRegistry.revokePublicPermission(this.id, operation)
    }

    async addToStorageNode(node: StorageNode | EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        await this._nodeRegistry.addStreamToStorageNode(this.id, address)
    }

    async removeFromStorageNode(node: StorageNode | EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        return this._nodeRegistry.removeStreamFromStorageNode(this.id, address)
    }

    private async isStreamStoredInStorageNode(node: StorageNode | EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        return this._nodeRegistry.isStreamStoredInStorageNode(this.id, address)
    }

    async getStorageNodes() {
        return this._nodeRegistry.getStorageNodesOf(this.id)
    }

    async publish<T>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
    }

    static parseStreamPropsFromJson(propsString: string): StreamProperties {
        try {
            return JSON.parse(propsString)
        } catch (error) {
            throw new Error(`Could not parse properties from onchain metadata: ${propsString}`)
        }
    }
}

export {
    StreamrStream as Stream
}
