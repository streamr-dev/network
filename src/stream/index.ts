import { getEndpointUrl } from '../utils'
import authFetch from '../rest/authFetch'

import StorageNode from './StorageNode'
import StreamrClient from '../StreamrClient'
import { Todo } from '../types'

export enum StreamOperation {
    STREAM_GET = 'stream_get',
    STREAM_EDIT = 'stream_edit',
    STREAM_DELETE = 'stream_delete',
    STREAM_PUBLISH = 'stream_publish',
    STREAM_SUBSCRIBE = 'stream_subscribe',
    STREAM_SHARE = 'stream_share'
}

export type StreamProperties = Todo

const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

type Field = {
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

export default class Stream {
    // TODO add field definitions for all fields
    // @ts-expect-error
    id: string
    config: {
        fields: Field[];
    } = { fields: [] }
    _client: StreamrClient

    constructor(client: StreamrClient, props: StreamProperties) {
        this._client = client
        Object.assign(this, props)
    }

    async update() {
        const json = await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id),
            this._client.session,
            {
                method: 'PUT',
                body: JSON.stringify(this.toObject()),
            },
        )
        return json ? new Stream(this._client, json) : undefined
    }

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
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id),
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    async getPermissions() {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions'),
            this._client.session,
        )
    }

    async getMyPermissions() {
        return authFetch(
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

        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions'),
            this._client.session,
            {
                method: 'POST',
                body: JSON.stringify(permissionObject),
            },
        )
    }

    async revokePermission(permissionId: number) {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions', permissionId),
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

    async addToStorageNode(address: string) {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes'),
            this._client.session,
            {
                method: 'POST',
                body: JSON.stringify({
                    address
                })
            },
        )
    }

    async removeFromStorageNode(address: string) {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes', address),
            this._client.session,
            {
                method: 'DELETE'
            },
        )
    }

    async getStorageNodes() {
        const json = await authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'storageNodes'),
            this._client.session,
        )
        return json.map((item: any) => new StorageNode(item.storageNodeAddress))
    }

    async publish(...theArgs: Todo) {
        return this._client.publish(this.id, ...theArgs)
    }
}
