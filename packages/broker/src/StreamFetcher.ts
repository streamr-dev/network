import memoize from 'memoizee'
import StreamrClient, { EthereumAddress, Stream, StreamOperation } from 'streamr-client'
import memoizee from "memoizee"

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

type FetchMethod = (streamId: string, sessionToken?: string) => Promise<Stream>

type CheckPermissionMethod = (
    streamId: string,
    user: EthereumAddress,
    operation?: StreamOperation,
) => Promise<true>

type AuthenticateMethod = (
    streamId: string,
    operation?: string
) => Promise<Stream>
export class StreamFetcher {
    fetch: memoizee.Memoized<FetchMethod> & FetchMethod
    checkPermission: memoizee.Memoized<CheckPermissionMethod> & CheckPermissionMethod
    authenticate: memoize.Memoized<AuthenticateMethod> & AuthenticateMethod
    client: StreamrClient

    constructor(client: StreamrClient) {
        this.fetch = memoize<FetchMethod>(this.uncachedFetch, {
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

    // async getToken(privateKey: string): Promise<string> {
    //     const client = new StreamrClient({
    //         auth: {
    //             privateKey,
    //         },
    //         restUrl: this.apiUrl,
    //         autoConnect: false
    //     })
    //     return client.session.getSessionToken()
    // }

    private async uncachedAuthenticate(
        streamId: string,
        sessionToken: string|undefined,
        operation = StreamOperation.STREAM_SUBSCRIBE
    ): Promise<Stream>  {
        await this.checkPermission(streamId, operation)
        return this.fetch(streamId, sessionToken)
    }

    /**
     * Returns a Promise that resolves with the stream json.
     */
    private async uncachedFetch(streamId: string): Promise<Stream> {
        return this.client.getStream(streamId)
    }

    /**
     * Retrieves permissions to a stream, and checks if a permission is granted
     * for the requested operation.
     * Promise always resolves to true or throws if permission has not been granted.
     */
    private async uncachedCheckPermission(streamId: string, user: EthereumAddress,
        operation: StreamOperation = StreamOperation.STREAM_SUBSCRIBE): Promise<true> {
        if (streamId == null) {
            throw new Error('_checkPermission: streamId can not be null!')
        }
        const result = await (await this.client.getStream(streamId)).hasUserPermission(operation, user)
        if (result) {
            return result
        } else {
            throw new Error(`unauthorized: user ${user} does not have permission ${operation.toString()} on stream ${streamId}`)
        }
    }
}
