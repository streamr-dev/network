const fetch = require('node-fetch')
const memoize = require('memoizee')
const debug = require('debug')('streamr:StreamFetcher')

const HttpError = require('./errors/HttpError')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

function formHeaders(authKey, sessionToken) {
    const headers = {}
    if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`
    } else if (authKey) {
        headers.Authorization = `token ${authKey}`
    }
    return headers
}

module.exports = class StreamFetcher {
    constructor(baseUrl) {
        this.streamResourceUrl = `${baseUrl}/api/v1/streams`
        this.loginUrl = `${baseUrl}/api/v1/login/apikey`
        this.fetch = memoize(this._fetch, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.checkPermission = memoize(this._checkPermission, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.authenticate = memoize(this._authenticate, {
            maxAge: MAX_AGE_MINUTE,
            promise: true,
        })
    }

    _authenticate(streamId, apiKey, sessionToken, operation = 'stream_subscribe') {
        return this.checkPermission(streamId, apiKey, sessionToken, operation)
            .then(() => this.fetch(streamId, apiKey, sessionToken))
    }

    getToken(apiKey) {
        return new Promise((resolve, reject) => {
            fetch(this.loginUrl, {
                method: 'POST',
                body: JSON.stringify({
                    apiKey
                }),
                headers: {
                    'Content-Type': 'application/json'
                },
            }).then((res) => res.json()).then((json) => resolve(json))
        })
    }

    /**
     * Returns a Promise that resolves with the stream json. Fails if there is no read permission.
     *
     * @param streamId
     * @param apiKey
     * @param sessionToken
     * @returns {Promise.<TResult>}
     * @private
     */
    _fetch(streamId, apiKey, sessionToken) {
        const headers = formHeaders(apiKey, sessionToken)

        const url = `${this.streamResourceUrl}/${streamId}`
        return fetch(url, {
            headers,
        }).catch((e) => {
            console.error(`failed to communicate with E&E: ${e}`)
            throw e
        }).then((response) => {
            if (response.status !== 200) {
                debug(
                    'fetch failed with status %d for streamId %s, apiKey %s, sessionToken %s : %o',
                    response.status, streamId, apiKey, sessionToken, response.text(),
                )
                this.fetch.delete(streamId, apiKey, sessionToken) // clear cache result
                throw new HttpError(response.status, 'GET', url)
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
     * @param apiKey
     * @param sessionToken
     * @param operation
     * @returns {Promise}
     * @private
     */
    _checkPermission(streamId, apiKey, sessionToken, operation = 'stream_subscribe') {
        const headers = formHeaders(apiKey, sessionToken)

        if (streamId == null) {
            throw new Error('streamId can not be null!')
        }

        const url = `${this.streamResourceUrl}/${streamId}/permissions/me`
        return fetch(url, {
            headers,
        }).catch((e) => {
            console.error(`failed to communicate with E&E: ${e}`)
            throw e
        }).then((response) => {
            if (response.status !== 200) {
                return response.text().then((errorMsg) => {
                    debug(
                        'checkPermission failed with status %d for streamId %s, apiKey %s, sessionToken %s, operation %s: %s',
                        response.status, streamId, apiKey, sessionToken, operation, errorMsg,
                    )
                    this.checkPermission.delete(streamId, apiKey, sessionToken, operation) // clear cache result
                    throw new HttpError(response.status, 'GET', url)
                }).catch((err) => {
                    console.error(err)
                    throw err
                })
            }

            return response.json().then((permissions) => {
                if (permissions.some((p) => p.operation === operation)) {
                    return true
                }

                debug(
                    'checkPermission failed for streamId %s, apiKey %s, sessionToken %s, operation %s. permissions were: %o',
                    streamId, apiKey, sessionToken, operation, permissions,
                )
                throw new HttpError(403, 'GET', url)
            })
        })
    }

    setFields(streamId, fields, apiKey, sessionToken) {
        const headers = formHeaders(apiKey, sessionToken)
        headers['Content-Type'] = 'application/json'
        const url = `${this.streamResourceUrl}/${streamId}/fields`
        return fetch(url, {
            method: 'POST',
            body: JSON.stringify(fields),
            headers,
        }).catch((e) => {
            console.error(`failed to communicate with E&E: ${e}`)
            throw e
        }).then(async (response) => {
            if (response.status !== 200) {
                debug(
                    'fetch failed with status %d for streamId %s, apiKey %s, sessionToken %s : %o',
                    response.status, streamId, apiKey, sessionToken, response.text(),
                )
                throw new HttpError(response.status, 'POST', url)
            } else {
                return response.json()
            }
        })
    }
}
