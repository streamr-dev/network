import { getEndpointUrl } from '../utils'
import authFetch from '../rest/authFetch'

import StorageNode from './StorageNode'

export default class Stream {
    constructor(client, props) {
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

    async hasPermission(operation, userId) {
        // eth addresses may be in checksumcase, but userId from server has no case

        const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this.getPermissions()

        return permissions.find((p) => {
            if (p.operation !== operation) { return false }

            if (userIdCaseInsensitive === undefined) {
                return !!p.anonymous // match nullish userId against p.anonymous
            }
            return p.user && p.user.toLowerCase() === userIdCaseInsensitive // match against userId
        })
    }

    async grantPermission(operation, userId) {
        const permissionObject = {
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

    async revokePermission(permissionId) {
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

    async addToStorageNode(address) {
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

    async removeFromStorageNode(address) {
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
        return json.map((item) => new StorageNode(item.storageNodeAddress))
    }

    async publish(...theArgs) {
        return this._client.publish(this.id, ...theArgs)
    }
}
