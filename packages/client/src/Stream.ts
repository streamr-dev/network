/**
 * Wrapper for Stream metadata and (some) methods.
 */
import fetch from 'node-fetch'
import { StreamMetadata } from 'streamr-client-protocol/dist/src/utils/StreamMessageValidator'
import { SPID, SID, MessageContent } from 'streamr-client-protocol'
import { DependencyContainer, inject } from 'tsyringe'

export { GroupKey } from './encryption/Encryption'
import { StorageNode } from './StorageNode'
import { EthereumAddress } from './types'
import { until } from './utils'

import { Rest } from './Rest'
import Resends from './Resends'
import Publisher from './Publisher'
import { BrubeckContainer } from './Container'

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

interface StreamPermisionBase {
    id: number
    operation: StreamOperation
}

export interface UserStreamPermission extends StreamPermisionBase {
    user: string
}

export interface AnonymousStreamPermisson extends StreamPermisionBase {
    anonymous: true
}

export type StreamPermision = UserStreamPermission | AnonymousStreamPermisson

export enum StreamOperation {
    STREAM_GET = 'stream_get',
    STREAM_EDIT = 'stream_edit',
    STREAM_DELETE = 'stream_delete',
    STREAM_PUBLISH = 'stream_publish',
    STREAM_SUBSCRIBE = 'stream_subscribe',
    STREAM_SHARE = 'stream_share'
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

    constructor(props: StreamProperties, @inject(BrubeckContainer) private _container: DependencyContainer) {
        Object.assign(this, props)
        this.id = props.id
        this.streamId = this.id
        this._rest = _container.resolve<Rest>(Rest)
        this._resends = _container.resolve<Resends>(Resends)
        this._publisher = _container.resolve<Publisher>(Publisher)
    }

    async update() {
        const json = await this._rest.put<StreamProperties>(
            ['streams', this.id],
            this.toObject(),
        )
        return json ? new StreamrStream(json, this._container) : undefined
    }

    toObject() {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (key.startsWith('_') || typeof key === 'function') { return }
            // @ts-expect-error
            result[key] = this[key]
        })
        return result
    }

    async delete() {
        await this._rest.del(
            ['streams', this.id],
        )
    }

    async getPermissions() {
        return this._rest.get<StreamPermision[]>(
            ['streams', this.id, 'permissions'],
        )
    }

    async getMyPermissions() {
        return this._rest.get<StreamPermision[]>(
            ['streams', this.id, 'permissions', 'me'],
        )
    }

    async hasPermission(operation: StreamOperation, userId: string|undefined) {
        // eth addresses may be in checksumcase, but userId from server has no case

        const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this.getPermissions()

        return permissions.find((p: any) => {
            if (p.operation !== operation) { return false }

            if (userIdCaseInsensitive === undefined) {
                return !!p.anonymous // match nullish userId against p.anonymous
            }
            return p.user && p.user.toLowerCase() === userIdCaseInsensitive // match against userId
        })
    }

    async grantPermission(operation: StreamOperation, userId: string|undefined) {
        const permissionObject: any = {
            operation,
        }

        const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined

        if (userIdCaseInsensitive !== undefined) {
            permissionObject.user = userIdCaseInsensitive
        } else {
            permissionObject.anonymous = true
        }

        return this._rest.post<StreamPermision>(
            ['streams', this.id, 'permissions'],
            permissionObject
        )
    }

    async revokePermission(permissionId: number) {
        return this._rest.del<StreamPermision>(
            ['streams', this.id, 'permissions', String(permissionId)],
        )
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

    async addToStorageNode(node: StorageNode|EthereumAddress, waitOptions: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node

        await this._rest.post(
            ['streams', this.id, 'storageNodes'],
            { address }
        )
        await this.waitUntilStorageAssigned(waitOptions)
    }

    async waitUntilStorageAssigned({
        timeout = 30000,
        pollInterval = 200
    }: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        // wait for propagation: the storage node sees the database change in E&E and
        // is ready to store the any stream data which we publish
        await until(() => this.isStreamStoredInStorageNode(this.id), timeout, pollInterval, () => (
            `Propagation timeout when adding stream to a storage node: ${this.id}`
        ))
    }

    private async isStreamStoredInStorageNode(streamId: string) {
        const sid: SID = SPID.parse(streamId)
        const nodes = await this._resends.getStreamNodes(sid)
        if (!nodes.length) { return false }
        const url = `${nodes[0].url}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/0`
        const response = await fetch(url)
        if (response.status === 200) {
            return true
        }
        if (response.status === 404) { // eslint-disable-line padding-line-between-statements
            return false
        }
        throw new Error(`Unexpected response code ${response.status} when fetching stream storage status`)
    }

    async removeFromStorageNode(node: StorageNode|EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node

        await this._rest.del<{ storageNodeAddress: string}[] >(
            ['streams', this.id, 'storageNodes', address]
        )
    }

    async getStreamNodes() {
        return this._resends.getStreamNodes(this.id)
    }

    async getStorageNodes() {
        const json = await this._rest.get<{ storageNodeAddress: string}[] >(
            ['streams', this.id, 'storageNodes']
        )
        return json.map((item: any) => new StorageNode(item.storageNodeAddress))
    }

    async publish<T extends MessageContent>(content: T, timestamp?: number|string|Date, partitionKey?: string) {
        return this._publisher.publish(this.id, content, timestamp, partitionKey)
    }
}

export {
    StreamrStream as Stream
}
