import memoize from 'memoizee'
import StreamrClient, { StreamPermission, EthereumAddress, Stream } from 'streamr-client'
import memoizee from "memoizee"

const MAX_AGE = 15 * 60 * 1000 // 15 minutes
const MAX_AGE_MINUTE = 1000 // 1 minutes

type FetchMethod = (streamId: string, sessionToken?: string) => Promise<Stream>

type CheckPermissionMethod = (
    streamId: string,
    user: EthereumAddress,
    permission?: StreamPermission,
) => Promise<true>

type AuthenticateMethod = (
    streamId: string,
    user: EthereumAddress,
    permission?: StreamPermission,
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

    private async uncachedAuthenticate(
        streamId: string,
        user: EthereumAddress,
        permission = StreamPermission.SUBSCRIBE
    ): Promise<Stream>  {
        await this.checkPermission(streamId, user, permission)
        return this.fetch(streamId)
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
        permission: StreamPermission = StreamPermission.SUBSCRIBE): Promise<true> {
        if (streamId == null) {
            throw new Error('_checkPermission: streamId can not be null!')
        }
        const result = await (await this.client.getStream(streamId)).hasUserPermission(permission, user)
        if (result) {
            return result
        } else {
            throw new Error(`unauthorized: user ${user} does not have permission ${permission.toString()} on stream ${streamId}`)
        }
    }
}
