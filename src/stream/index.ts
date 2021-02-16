import { getEndpointUrl } from '../utils'
import authFetch from '../rest/authFetch'

import StorageNode from './StorageNode'
import StreamrClient from '../StreamrClient'
import { Todo } from '../types'

export default class Stream {

    // TODO add field definitions for all fields
    // @ts-expect-error
    id: string
    _client: StreamrClient

    constructor(client: StreamrClient, props: Todo) {
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

    async hasPermission(operation: Todo, userId: Todo) {
        // eth addresses may be in checksumcase, but userId from server has no case

        const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this.getPermissions()

        return permissions.find((p: Todo) => {
            if (p.operation !== operation) { return false }

            if (userIdCaseInsensitive === undefined) {
                return !!p.anonymous // match nullish userId against p.anonymous
            }
            return p.user && p.user.toLowerCase() === userIdCaseInsensitive // match against userId
        })
    }

    async grantPermission(operation: Todo, userId: Todo) {
        const permissionObject: Todo = {
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

    async revokePermission(permissionId: Todo) {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'permissions', permissionId),
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    async detectFields() {
        return authFetch(
            getEndpointUrl(this._client.options.restUrl, 'streams', this.id, 'detectFields'),
            this._client.session,
        )
    }

    async addToStorageNode(address: Todo) {
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

    async removeFromStorageNode(address: Todo) {
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
        return json.map((item: Todo) => new StorageNode(item.storageNodeAddress))
    }

    async publish(...theArgs: Todo) {
        return this._client.publish(this.id, ...theArgs)
    }
}
