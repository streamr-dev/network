import fetch from 'node-fetch'
import { getAddress } from '@ethersproject/address'
import { getEndpointUrl, until } from '../utils'
import authFetch from '../rest/authFetch'

export { GroupKey } from './encryption/Encryption'

import { StorageNode } from './StorageNode'
import { StreamrClient } from '../StreamrClient'
import { EthereumAddress } from '../types'

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
    id?: string
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

class StreamrStream {
    // @ts-expect-error
    id: string
    // @ts-expect-error
    name: string
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions?: number
    /** @internal */
    _client: StreamrClient
    requireEncryptedData?: boolean
    requireSignedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number

    constructor(client: StreamrClient, props: StreamProperties) {
        this._client = client
        Object.assign(this, props)
    }

    async update() {
        const json = await authFetch<StreamProperties>(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id),
            this._client.session,
            {
                method: 'PUT',
                body: JSON.stringify(this.toObject()),
            },
        )
        return json ? new StreamrStream(this._client, json) : undefined
    }

    /** @internal */
    toObject() {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (!key.startsWith('_')) {
                // @ts-expect-error
                result[key] = this[key]
            }
        })
        return result
    }

    async delete() {
        await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id),
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    async getPermissions() {
        return authFetch<StreamPermision[]>(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions'),
            this._client.session,
        )
    }

    async getMyPermissions() {
        return authFetch<StreamPermision[]>(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions', 'me'),
            this._client.session,
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

        return authFetch<StreamPermision>(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions'),
            this._client.session,
            {
                method: 'POST',
                body: JSON.stringify(permissionObject),
            },
        )
    }

    async revokePermission(permissionId: number) {
        await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions', String(permissionId)),
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._client.resend({
            stream: this.id,
            resend: {
                last: 1,
            },
        })

        const receivedMsgs = await sub.collect()

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

    async addToStorageNode(node: StorageNode|EthereumAddress, {
        timeout = 30000,
        pollInterval = 200
    }: {
        timeout?: number,
        pollInterval?: number
    } = {}) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        // currently we support only one storage node
        // -> we can validate that the given address is that address
        // -> remove this comparison when we start to support multiple storage nodes
        if (getAddress(address) !== this._client.options.storageNode.address) {
            throw new Error('Unknown storage node: ' + address)
        }

        await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes'),
            this._client.session, {
                method: 'POST',
                body: JSON.stringify({
                    address
                })
            },
        )
        // wait for propagation: the storage node sees the database change in E&E and
        // is ready to store the any stream data which we publish
        await until(() => this.isStreamStoredInStorageNode(this.id), timeout, pollInterval, () => (
            `Propagation timeout when adding stream to a storage node: ${this.id}`
        ))
    }

    private async isStreamStoredInStorageNode(streamId: string) {
        const url = `${this._client.options.storageNode.url}/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/0`
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
        await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes', address),
            this._client.session,
            {
                method: 'DELETE'
            },
        )
    }

    async getStorageNodes() {
        const json = await authFetch<{ storageNodeAddress: string}[] >(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes'),
            this._client.session,
        )
        return json.map((item: any) => new StorageNode(item.storageNodeAddress))
    }

    async publish(content: object, timestamp?: number|string|Date, partitionKey?: string) {
        return this._client.publish(this.id, content, timestamp, partitionKey)
    }
}

export {
    StreamrStream as Stream
}
