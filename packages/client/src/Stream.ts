import { MessageContent } from 'streamr-client-protocol'
import { delay, DependencyContainer, inject } from 'tsyringe'

export { GroupKey } from './encryption/Encryption'
import { StorageNode } from './StorageNode'
import { EthereumAddress } from './types'

import { Rest } from './Rest'
import Resends from './Resends'
import Publisher from './Publisher'
import { BigNumber } from '@ethersproject/bignumber'
import BrubeckClient from '.'
import { StreamMetadata } from '../../protocol/dist/src/utils/StreamMessageValidator'

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

// function getFieldType(value: any): (Field['type'] | undefined) {
//     const type = typeof value
//     switch (true) {
//         case Array.isArray(value): {
//             return 'list'
//         }
//         case type === 'object': {
//             return 'map'
//         }
//         case (VALID_FIELD_TYPES as ReadonlyArray<string>).includes(type): {
//             // see https://github.com/microsoft/TypeScript/issues/36275
//             return type as Field['type']
//         }
//         default: {
//             return undefined
//         }
//     }
// }

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
    _client: BrubeckClient
    _rest: Rest
    _resends: Resends
    _publisher: Publisher

    constructor(
        props: StreamProperties, private container: DependencyContainer
    ) {
        Object.assign(this, props)
        this.id = props.id
        this.streamId = this.id
        this._rest = container.resolve<Rest>(Rest)
        this._resends = container.resolve<Resends>(Resends)
        this._publisher = container.resolve<Publisher>(Publisher)
        this._client = container.resolve<BrubeckClient>(BrubeckClient)
    }

    async update() {
        await this._client.updateStream(this.toObject())
    }

    toObject() : StreamProperties {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (!key.startsWith('_')) {
                // @ts-expect-error
                result[key] = this[key]
            }
        })
        return result as StreamProperties
    }

    async delete() {
        await this._client.deleteStream(this.id)
    }

    async getPermissions() {
        return this._client.getAllPermissionsForStream(this.id)
    }

    async getMyPermissions() {
        return this._client.getPermissionsForUser(this.id, await this._client.getAddress())
    }

    async hasPermission(operation: StreamOperation, userId: EthereumAddress) {
        // eth addresses may be in checksumcase, but userId from server has no case

        // const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this._client.getPermissionsForUser(this.id, userId)

        if (operation === StreamOperation.STREAM_PUBLISH || operation === StreamOperation.STREAM_SUBSCRIBE) {
            return permissions[operation].gt(Date.now())
        }
        return permissions[operation]
    }

    async grantPermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._client.grantPermission(this.id, operation, recipientId.toLowerCase())
    }

    async grantPublicPermission(operation: StreamOperation) {
        await this._client.grantPublicPermission(this.id, operation)
    }

    async revokePermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._client.revokePermission(this.id, operation, recipientId.toLowerCase())
    }

    async revokePublicPermission(operation: StreamOperation) {
        await this._client.revokePublicPermission(this.id, operation)
    }

    async addToStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        await this._client.addStreamToStorageNode(this.id, node.address || node)
    }

    async removeFromStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        return this._client.removeStreamFromStorageNode(this.id, node.address || node)
    }

    private async isStreamStoredInStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        return this._client.isStreamStoredInStorageNode(this.id, node.address || node)
    }

    async getStorageNodes() {
        return this._client.getAllStorageNodes()
    }

    async publish<T extends MessageContent>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
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
