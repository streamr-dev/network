const fetch = require('node-fetch')
const memoize = require('memoizee')
const debug = require('debug')('streamr:StreamFetcher')
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
     * @returns {Promise.<TResult>}
     * @private
     */
    _fetch(streamId, authKey) {
        const headers = {}
        if (authKey) {
            headers.Authorization = `token ${authKey}`
        }

        return fetch(`${this.streamResourceUrl}/${streamId}`, {
            headers,
        }).then((response) => {
            if (response.status !== 200) {
                debug('fetch: failed for stream "%s" and key "%s" with status code "%d"', streamId, authKey, response.status)
                this.fetch.delete(streamId, authKey) // clear cache result
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
     * @param operation
     * @returns {Promise}
     * @private
     */
    _checkPermission(streamId, authKey, operation = 'read') {
        const headers = {}
        if (authKey) {
            headers.Authorization = `token ${authKey}`
        }

        return fetch(`${this.streamResourceUrl}/${streamId}/permissions/me`, {
            headers,
        }).then((response) => {
            if (response.status !== 200) {
                return response.text().then((errorMsg) => {
                    debug('checkPermission: failed for stream "%s", key "%s", operation "%s" with status code "%d" and response "%s"', streamId, authKey, operation, response.status, errorMsg)
                    this.checkPermission.delete(streamId, authKey, operation) // clear cache result
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
                debug('checkPermission: failed for stream "%s", key "%s", operation "%s". Permission not found in "%o"', streamId, authKey, operation, permissions)
                throw new HttpError(403)
            })
        })
    }

    authenticate(streamId, authKey, operation = 'read') {
        if (operation === 'read') {
            // No need to explicitly check permissions, as fetch will fail if no read permission
            return this.fetch(streamId, authKey)
        }
        return this.checkPermission(streamId, authKey, operation).then(() => this.fetch(streamId, authKey))
    }
}
