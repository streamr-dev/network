import {
    HexString,
    StreamID,
    StreamPartID,
    collect,
    toEthereumAddress,
    toStreamPartID
} from '@streamr/utils'
import { isNumber, isString } from 'lodash'
import range from 'lodash/range'
import { PublishMetadata } from '../src/publish/Publisher'
import { Message } from './Message'
import { DEFAULT_PARTITION } from './StreamIDBuilder'
import { StreamMetadata, getPartitionCount } from './StreamMetadata'
import { StreamrClient } from './StreamrClient'
import {
    PermissionAssignment,
    PublicPermissionQuery,
    UserPermissionQuery,
    toInternalPermissionAssignment,
    toInternalPermissionQuery
} from './permission'

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
     * Updates the metadata of the stream.
     */
    async update(metadata: StreamMetadata): Promise<void> {
        await this.client.updateStream(this.id, metadata)
        this.metadata = metadata
    }

    /**
     * Deletes the stream.
     *
     * @remarks Stream instance should not be used afterwards.
     */
    async delete(): Promise<void> {
        await this.client.deleteStream(this.id)
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
     * Attempts to detect and update the {@link StreamMetadata.config} metadata of the stream by performing a resend.
     *
     * @remarks Only works on stored streams.
     *
     * @returns be mindful that in the case of there being zero messages stored, the returned promise will resolve even
     * though fields were not updated
     */
    async detectFields(): Promise<void> {
        // Get last message of the stream to be used for field detecting
        const sub = await this.client.resend(
            toStreamPartID(this.id, DEFAULT_PARTITION),
            {
                last: 1
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
        const merged = flatMerge(this.getMetadata(), {
            config: {
                fields
            }
        })
        await this.update(merged)
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
}
