import authFetch from '../authFetch'

export default class Stream {
    constructor(client, props) {
        this._client = client
        Object.assign(this, props)
    }

    async update() {
        const json = await authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
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

    delete() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}`,
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    getPermissions() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/permissions`,
            this._client.session,
        )
    }

    async hasPermission(operation, userId) {
        const permissions = await this.getPermissions()
        return permissions.find((p) => p.operation === operation && ((userId == null && p.anonymous) || (userId != null && p.user === userId)))
    }

    grantPermission(operation, userId) {
        const permissionObject = {
            operation,
        }

        if (userId != null) {
            permissionObject.user = userId
        } else {
            permissionObject.anonymous = true
        }

        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/permissions`,
            this._client.session,
            {
                method: 'POST',
                body: JSON.stringify(permissionObject),
            },
        )
    }

    revokePermission(permissionId) {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/permissions/${permissionId}`,
            this._client.session,
            {
                method: 'DELETE',
            },
        )
    }

    detectFields() {
        return authFetch(
            `${this._client.options.restUrl}/streams/${this.id}/detectFields`,
            this._client.session,
        )
    }

    publish(data, timestamp = Date.now()) {
        return this._client.publish(this.id, data, timestamp)
    }
}
