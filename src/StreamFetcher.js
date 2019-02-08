const fetch = require('node-fetch')
const memoize = require('memoizee')
const debug = require('debug')('streamr:StreamFetcher')
const AuthorizationHeaderUtil = require('./utils/AuthorizationHeaderUtil')
const HttpError = require('./errors/HttpError')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes

module.exports = class StreamFetcher {
    constructor(baseUrl) {
        this.streamResourceUrl = `${baseUrl}/api/v1/streams`
        this.fetch = memoize(this._fetch, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.checkPermission = memoize(this._checkPermission, {
            maxAge: MAX_AGE,
            promise: true,
        })
    }

    /**
     * Returns a Promise that resolves with the stream json. Fails if there is no read permission.
     *
     * @param streamId
     * @param authKey
     * @param sessionToken
     * @returns {Promise.<TResult>}
     * @private
     */
    _fetch(streamId, authKey, sessionToken) {
        const headers = AuthorizationHeaderUtil.getAuthorizationHeader(authKey, sessionToken)

        return fetch(`${this.streamResourceUrl}/${streamId}`, {
            headers,
        }).then((response) => {
            if (response.status !== 200) {
                debug(
                    'fetch failed with status %d for streamId %s key %s sessionToken %s : %o',
                    response.status, streamId, authKey, sessionToken, response.text(),
                )
                this.fetch.delete(streamId, authKey, sessionToken) // clear cache result
                throw new HttpError(response.status)
            } else {
                return response.json()
            }
        })
    }

    /**
     * Retrieves permissions to a stream, and checks if a permission is granted for the requested operation.
     * Promise always resolves to true.
     *
     * @param streamId
     * @param authKey
     * @param sessionToken
     * @param operation
     * @returns {Promise}
     * @private
     */
    _checkPermission(streamId, authKey, sessionToken, operation = 'read') {
        const headers = AuthorizationHeaderUtil.getAuthorizationHeader(authKey, sessionToken)

        return fetch(`${this.streamResourceUrl}/${streamId}/permissions/me`, {
            headers,
        }).then((response) => {
            if (response.status !== 200) {
                return response.text().then((errorMsg) => {
                    debug(
                        'checkPermission failed with status %d for streamId %s key %s sessionToken %s operation %s: %s',
                        response.status, streamId, authKey, sessionToken, operation, errorMsg,
                    )
                    this.checkPermission.delete(streamId, authKey, sessionToken, operation) // clear cache result
                    throw new HttpError(response.status)
                })
            }

            return response.json().then((permissions) => {
                for (let i = 0; i < permissions.length; ++i) {
                    if (permissions[i].operation === operation) {
                        return true
                    }
                }

                // Permission was not found
                debug(
                    'checkPermission failed for streamId %s key %s sessionToken %s operation %s. permissions were: %o',
                    streamId, authKey, sessionToken, operation, permissions,
                )
                throw new HttpError(403)
            })
        })
    }

    authenticate(streamId, authKey, sessionToken, operation = 'read') {
        if (operation === 'read') {
            // No need to explicitly check permissions, as fetch will fail if no read permission
            return this.fetch(streamId, authKey, sessionToken)
        }
        return this.checkPermission(streamId, authKey, sessionToken, operation).then(() => this.fetch(streamId, authKey, sessionToken))
    }
}
