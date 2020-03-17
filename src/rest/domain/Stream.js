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

    grantPermission(operation, userId) {
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

    publish(...theArgs) {
        return this._client.publish(this.id, ...theArgs)
    }
}
