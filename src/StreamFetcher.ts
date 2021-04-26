import fetch from 'node-fetch'
import memoize from 'memoizee'
import { getLogger } from './helpers/logger'
import { HttpError } from './errors/HttpError'
// TODO do all REST operations to E&E via StreamrClient
import StreamrClient from 'streamr-client'
import { Todo } from './types'

const logger = getLogger('streamr:StreamFetcher')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

function formHeaders(sessionToken: string|undefined) {
    const headers: any = {}
    if (sessionToken) {
        headers.Authorization = `Bearer ${sessionToken}`
    }
    return headers
}

async function fetchWithErrorLogging(...args: Todo[]) {
    try {
        // @ts-expect-error
        return await fetch(...args)
    } catch (e) {
        logger.error(`failed to communicate with E&E: ${e}`)
        throw e
    }
}

async function handleNon2xxResponse(funcName: Todo, response: Todo, streamId: string, sessionToken: string|undefined, method: Todo, url: string) {
    const errorMsg = await response.text()
    logger.debug(
        '%s failed with status %d for streamId %s, sessionToken %s : %o',
        funcName, response.status, streamId, sessionToken, errorMsg,
    )
    throw new HttpError(response.status, method, url)
}

export class StreamFetcher {

    apiUrl: string
    fetch: Todo
    checkPermission: Todo
    authenticate: Todo

    constructor(baseUrl: string) {
        this.apiUrl = `${baseUrl}/api/v1`
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

    async _authenticate(streamId: string, sessionToken: string|undefined, operation = 'stream_subscribe') {
        await this.checkPermission(streamId, sessionToken, operation)
        return this.fetch(streamId, sessionToken)
    }

    async getToken(privateKey: string) {
        const client = new StreamrClient({
            auth: {
                privateKey
            },
            restUrl: this.apiUrl,
            autoConnect: false
        })
        // @ts-expect-error
        return await client.session.getSessionToken()
    }

    /**
     * Returns a Promise that resolves with the stream json. Fails if there is no read permission.
     *
     * @param streamId
     * @param sessionToken
     * @returns {Promise.<TResult>}
     * @private
     */
    async _fetch(streamId: string, sessionToken: string|undefined) {
        const url = `${this.apiUrl}/streams/${encodeURIComponent(streamId)}`
        const headers = formHeaders(sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers
        })

        if (response.status !== 200) {
            this.fetch.delete(streamId, sessionToken) // clear cache result
            return handleNon2xxResponse('_fetch', response, streamId, sessionToken, 'GET', url)
        }
        return response.json()
    }

    /**
     * Retrieves permissions to a stream, and checks if a permission is granted for the requested operation.
     * Promise always resolves to true.
     *
     * @param streamId
     * @param sessionToken
     * @param operation
     * @returns {Promise}
     * @private
     */
    async _checkPermission(streamId: string, sessionToken: string|undefined, operation = 'stream_subscribe') {
        if (streamId == null) {
            throw new Error('streamId can not be null!')
        }

        const url = `${this.apiUrl}/streams/${encodeURIComponent(streamId)}/permissions/me`
        const headers = formHeaders(sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers,
        })

        if (response.status !== 200) {
            this.checkPermission.delete(streamId, sessionToken) // clear cache result
            return handleNon2xxResponse('_checkPermission', response, streamId, sessionToken, 'GET', url)
        }

        const permissions = await response.json()
        if (permissions.some((p: Todo) => p.operation === operation)) {
            return true
        }

        logger.debug(
            'checkPermission failed for streamId %s, sessionToken %s, operation %s. permissions were: %o',
            streamId, sessionToken, operation, permissions,
        )
        throw new HttpError(403, 'GET', url)
    }
}
