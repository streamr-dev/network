const fetch = require('node-fetch')
const memoize = require('memoizee')

const logger = require('./helpers/logger')('streamr:StreamFetcher')
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

async function fetchWithErrorLogging(...args) {
    try {
        return await fetch(...args)
    } catch (e) {
        logger.error(`failed to communicate with E&E: ${e}`)
        throw e
    }
}

async function handleNon2xxResponse(funcName, response, streamId, apiKey, sessionToken, method, url) {
    const errorMsg = await response.text()
    logger.debug(
        '%s failed with status %d for streamId %s, apiKey %s, sessionToken %s : %o',
        funcName, response.status, streamId, apiKey, sessionToken, errorMsg,
    )
    throw new HttpError(response.status, method, url)
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

    async getToken(apiKey) {
        const response = await fetchWithErrorLogging(this.loginUrl, {
            method: 'POST',
            body: JSON.stringify({
                apiKey
            }),
            headers: {
                'Content-Type': 'application/json'
            },
        })
        return response.json()
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
    async _fetch(streamId, apiKey, sessionToken) {
        const url = `${this.streamResourceUrl}/${encodeURIComponent(streamId)}`
        const headers = formHeaders(apiKey, sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers
        })

        if (response.status !== 200) {
            this.fetch.delete(streamId, apiKey, sessionToken) // clear cache result
            return handleNon2xxResponse('_fetch', response, streamId, apiKey, sessionToken, 'GET', url)
        }
        return response.json()
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
    async _checkPermission(streamId, apiKey, sessionToken, operation = 'stream_subscribe') {
        if (streamId == null) {
            throw new Error('streamId can not be null!')
        }

        const url = `${this.streamResourceUrl}/${encodeURIComponent(streamId)}/permissions/me`
        const headers = formHeaders(apiKey, sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers,
        })

        if (response.status !== 200) {
            this.checkPermission.delete(streamId, apiKey, sessionToken) // clear cache result
            return handleNon2xxResponse('_checkPermission', response, streamId, apiKey, sessionToken, 'GET', url)
        }

        const permissions = await response.json()
        if (permissions.some((p) => p.operation === operation)) {
            return true
        }

        logger.debug(
            'checkPermission failed for streamId %s, apiKey %s, sessionToken %s, operation %s. permissions were: %o',
            streamId, apiKey, sessionToken, operation, permissions,
        )
        throw new HttpError(403, 'GET', url)
    }
}
