import memoize from 'memoizee'
// TODO do all REST operations to E&E via StreamrClient
import StreamrClient, { EthereumAddress, StreamOperation } from 'streamr-client'
import { Todo } from './types'

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

export class StreamFetcher {

    fetch
    checkPermission
    authenticate
    client: StreamrClient

    constructor(client: StreamrClient) {
        this.fetch = memoize<StreamFetcher['_fetch']>(this._fetch, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.checkPermission = memoize<CheckPermissionMethod>(this.uncachedCheckPermission, {
            maxAge: MAX_AGE,
            promise: true,
        })
        this.authenticate = memoize<StreamFetcher['uncachedAuthenticate']>(this.uncachedAuthenticate, {
            maxAge: MAX_AGE_MINUTE,
            promise: true,
        })
        this.client = client
    }

    }

    async getToken(privateKey: string): Promise<string> {
        const client = new StreamrClient({
            auth: {
                privateKey,
            },
            restUrl: this.apiUrl,
            autoConnect: false
        })
        return client.session.getSessionToken()
    }

    private async uncachedAuthenticate(
        streamId: string,
        sessionToken: string|undefined,
        operation = 'stream_subscribe'
    ): Promise<Record<string, unknown>>  {
        await this.checkPermission(streamId, sessionToken, operation)
        return this.fetch(streamId, sessionToken)
    }

    /**
     * Returns a Promise that resolves with the stream json.
     */
    private async uncachedFetch(streamId: string, sessionToken?: string): Promise<Record<string, unknown>> {
        const url = `${this.apiUrl}/streams/${encodeURIComponent(streamId)}`
        const headers = formAuthorizationHeader(sessionToken)

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
     * Promise always resolves to true or throws if permission has not been granted.
     */
    private async uncachedCheckPermission(streamId: string, operation: StreamOperation = StreamOperation.STREAM_SUBSCRIBE,
        user: EthereumAddress): Promise<boolean> {
        if (streamId == null) {
            throw new Error('_checkPermission: streamId can not be null!')
        }
        const result = await (await this.client.getStream(streamId)).hasPermission(operation, user)
        if (result) {
            return result
        } else {
            throw new Error(`unauthorized: user ${user} does not have permission ${operation.toString()} on stream ${streamId}`)
        }
    }
}
