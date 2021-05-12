import fetch, { Headers, Response } from 'node-fetch'
import memoize from 'memoizee'
import { getLogger } from './helpers/logger'
import { HttpError } from './errors/HttpError'
// TODO do all REST operations to E&E via StreamrClient
import StreamrClient from 'streamr-client'
import { Todo } from './types'

const logger = getLogger('streamr:StreamFetcher')

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

function formHeaders(sessionToken?: string) {
    const headers: Headers = new Headers()
    if (sessionToken) {
        headers.set('Authorization', `Bearer ${sessionToken}`)
    }
    return headers
}

async function fetchWithErrorLogging(...args: Parameters<typeof fetch>) {
    try {
        return await fetch(...args)
    } catch (err) {
        logger.error(`failed to communicate with core-api: ${err}`)
        throw err
    }
}

async function handleNon2xxResponse(
    funcName: string,
    response: Response,
    streamId: string,
    sessionToken: string|undefined|null,
    method: string,
    url: string,
): Promise<HttpError> {
    const errorMsg = await response.text().catch((err) => {
        logger.warn('Error reading response text: %s', err)
        return ''
    })
    logger.debug(
        '%s failed with status %d for streamId %s, sessionToken %s: %o',
        funcName, response.status, streamId, sessionToken, errorMsg,
    )
    return new HttpError(response.status, method, url)
}

export class StreamFetcher {

    apiUrl: string
    fetch
    checkPermission
    authenticate

    constructor(baseUrl: string) {
        this.apiUrl = `${baseUrl}/api/v1`
        this.fetch = memoize<StreamFetcher['_fetch']>(this._fetch, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.checkPermission = memoize<StreamFetcher['_checkPermission']>(this._checkPermission, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.authenticate = memoize<StreamFetcher['_authenticate']>(this._authenticate, {
            maxAge: MAX_AGE_MINUTE,
            promise: true,
        })
    }

    async getToken(privateKey: string): Promise<Todo> {
        const client = new StreamrClient({
            auth: {
                privateKey,
            },
            restUrl: this.apiUrl,
            autoConnect: false
        })

        return client.session.getSessionToken()
    }

    private async _authenticate(streamId: string, sessionToken: string|undefined, operation = 'stream_subscribe'): Promise<Todo>  {
        await this.checkPermission(streamId, sessionToken, operation)
        return this.fetch(streamId, sessionToken)
    }

    /**
     * Returns a Promise that resolves with the stream json.
     * Fails if there is no read permission.
     *
     * @param streamId
     * @param sessionToken
     * @returns {Promise.<TResult>}
     * @private
     */
    private async _fetch(streamId: string, sessionToken?: string): Promise<Todo> {
        const url = `${this.apiUrl}/streams/${encodeURIComponent(streamId)}`
        const headers = formHeaders(sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers,
        })

        if (response.status !== 200) {
            this.fetch.delete(streamId, sessionToken) // clear cache result
            throw await handleNon2xxResponse('_fetch', response, streamId, sessionToken, 'GET', url)
        }

        return response.json()
    }

    /**
     * Retrieves permissions to a stream, and checks if a permission is granted
     * for the requested operation.
     * Promise always resolves to true or throws if permissions are invalid.
     *
     * @param streamId
     * @param sessionToken
     * @param operation
     * @returns {Promise}
     * @private
     */
    private async _checkPermission(streamId: string, sessionToken: string | undefined | null, operation = 'stream_subscribe'): Promise<true> {
        if (streamId == null) {
            throw new Error('_checkPermission: streamId can not be null!')
        }

        sessionToken = sessionToken || undefined

        const url = `${this.apiUrl}/streams/${encodeURIComponent(streamId)}/permissions/me`
        const headers = formHeaders(sessionToken)

        const response = await fetchWithErrorLogging(url, {
            headers,
        })

        if (response.status !== 200) {
            this.checkPermission.delete(streamId, sessionToken) // clear cache result
            throw await handleNon2xxResponse('_checkPermission', response, streamId, sessionToken, 'GET', url)
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
