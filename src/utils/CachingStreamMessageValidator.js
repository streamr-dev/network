import memoize from 'promise-memoize'

import StreamMessageValidator from './StreamMessageValidator'

/**
 * A thin wrapper around StreamMessageValidator that adds caching for the following
 * expensive functions passed to the constructor:
 * - getStream
 * - isPublisher
 * - isSubscriber
 *
 * Caching the recoverAddress does not make sense, because the input is always unique.
 */
export default class CachingStreamMessageValidator extends StreamMessageValidator {
    /**
     * @param getStream async function(streamId): returns the stream metadata object for streamId
     * @param isPublisher async function(address, streamId): returns true if address is a permitted publisher on streamId
     * @param isSubscriber async function(address, streamId): returns true if address is a permitted subscriber on streamId
     * @param recoverAddress function(payload, signature): returns the Ethereum address that signed the payload to generate signature. Not cached.
     * @param cacheTimeoutMillis Number: Cache timeout in milliseconds. Default 15 minutes.
     * @param cacheErrorsTimeoutMillis Number: Cache timeout for error responses. Default 1 minute.
     */
    constructor({
        getStream, isPublisher, isSubscriber, recoverAddress,
        cacheTimeoutMillis = 15 * 60 * 1000, cacheErrorsTimeoutMillis = 60 * 1000,
    }) {
        StreamMessageValidator.checkInjectedFunctions(getStream, isPublisher, isSubscriber, recoverAddress)
        const memoizeOpts = {
            maxAge: cacheTimeoutMillis,
            maxErrorAge: cacheErrorsTimeoutMillis,
        }
        super({
            getStream: memoize(getStream, memoizeOpts),
            isPublisher: memoize(isPublisher, memoizeOpts),
            isSubscriber: memoize(isSubscriber, memoizeOpts),
            recoverAddress,
        })
    }
}
