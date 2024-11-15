import {
    HexString,
    StreamID,
    StreamPartID,
    toEthereumAddress,
    toStreamPartID
} from '@streamr/utils'
import { isNumber, isString } from 'lodash'
import range from 'lodash/range'
import { PublishMetadata } from '../src/publish/Publisher'
import { Message } from './Message'
import { StreamMetadata, getPartitionCount } from './StreamMetadata'
import { StreamrClient } from './StreamrClient'
import {
    PermissionAssignment,
    PublicPermissionQuery,
    UserPermissionQuery,
    toInternalPermissionAssignment,
    toInternalPermissionQuery
} from './permission'

/**
 * A convenience API for managing and accessing an individual stream.
 *
 * @category Important
 */
export class Stream {
    readonly id: StreamID
    private metadata: StreamMetadata
    private readonly client: StreamrClient

    /** @internal */
    constructor(
        id: StreamID,
        metadata: StreamMetadata,
        client: StreamrClient
    ) {
        this.id = id
        this.metadata = metadata
        this.client = client
    }

    /**
     * See {@link StreamrClient.publish | StreamrClient.publish}.
     *
     * @category Important
     */
    publish(content: unknown, metadata?: PublishMetadata): Promise<Message> {
        return this.client.publish(this.id, content, metadata)
    }

    /**
     * See {@link StreamrClient.hasPermission | StreamrClient.hasPermission}.
     *
     * @category Important
     */
    async hasPermission(query: Omit<UserPermissionQuery, 'streamId'> | Omit<PublicPermissionQuery, 'streamId'>): Promise<boolean> {
        return this.client.hasPermission(toInternalPermissionQuery({
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
        return this.client.getPermissions(this.id)
    }

    /**
     * See {@link StreamrClient.grantPermissions | StreamrClient.grantPermissions}.
     *
     * @category Important
     */
    async grantPermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this.client.grantPermissions(this.id, ...assignments.map(toInternalPermissionAssignment))
    }

    /**
     * See {@link StreamrClient.revokePermissions | StreamrClient.revokePermissions}.
     *
     * @category Important
     */
    async revokePermissions(...assignments: PermissionAssignment[]): Promise<void> {
        return this.client.revokePermissions(this.id, ...assignments.map(toInternalPermissionAssignment))
    }

    /**
     * See {@link StreamrClient.addStreamToStorageNode | StreamrClient.addStreamToStorageNode}.
     * 
     * @category Important
     */
    async addToStorageNode(storageNodeAddress: HexString, opts: { wait: boolean, timeout?: number } = { wait: false }): Promise<void> {
        await this.client.addStreamToStorageNode(this.id, storageNodeAddress, opts)
    }

    /**
     * See {@link StreamrClient.removeStreamFromStorageNode | StreamrClient.removeStreamFromStorageNode}.
     */
    async removeFromStorageNode(nodeAddress: HexString): Promise<void> {
        return this.client.removeStreamFromStorageNode(this.id, toEthereumAddress(nodeAddress))
    }

    /**
     * See {@link StreamrClient.getStorageNodes | StreamrClient.getStorageNodes}.
     */
    async getStorageNodes(): Promise<HexString[]> {
        return this.client.getStorageNodes(this.id)
    }

    /**
     * Returns the partitions of the stream.
     */
    getStreamParts(): StreamPartID[] {
        return range(0, this.getPartitionCount()).map((p) => toStreamPartID(this.id, p))
    }

    getPartitionCount(): number {
        return getPartitionCount(this.getMetadata())
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
        await this.setMetadata({
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
        await this.setMetadata({
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
     * Updates the metadata of the stream.
     */
    async setMetadata(metadata: StreamMetadata): Promise<void> {
        await this.client.setStreamMetadata(this.id, metadata)
        this.metadata = metadata
    }
}
