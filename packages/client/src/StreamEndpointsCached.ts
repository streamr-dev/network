/**
 * Cached Subset of StreamEndpoints.
 */
import { StreamID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { CacheAsyncFn, instanceId } from './utils'
import { Context } from './utils/Context'
import { CacheConfig, Config } from './Config'
import { StreamRegistry } from './StreamRegistry'

const SEPARATOR = '|' // always use SEPARATOR for cache key

@scoped(Lifecycle.ContainerScoped)
export class StreamEndpointsCached implements Context {
    id = instanceId(this)
    debug

    constructor(
        context: Context,
        @inject(delay(() => StreamRegistry)) private streamRegistry: StreamRegistry,
        @inject(Config.Cache) private cacheOptions: CacheConfig
    ) {
        this.debug = context.debug.extend(this.id)
    }

    async getStreamPreloaded(streamId: StreamID) {
        return this.streamRegistry.getStream(streamId)
    }

    getStream = CacheAsyncFn(this.getStreamPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey: ([streamId]: any) => {
            // see clearStream
            return `${streamId}${SEPARATOR}`
        }
    })

    async getStreamValidationInfoPreloaded(streamId: StreamID) {
        return this.streamRegistry.getStream(streamId)
    }

    getStreamValidationInfo = CacheAsyncFn(this.getStreamValidationInfoPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey: ([streamId]: any) => {
            return `${streamId}${SEPARATOR}`
        }
    })

    async isStreamPublisherPreloaded(streamId: StreamID, ethAddress: string) {
        return this.streamRegistry.isStreamPublisher(streamId, ethAddress)
    }

    isStreamPublisher = CacheAsyncFn(this.isStreamPublisherPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey([streamId, ethAddress]: any) {
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    async isStreamSubscriberPreloaded(streamId: StreamID, ethAddress: string) {
        return this.streamRegistry.isStreamSubscriber(streamId, ethAddress)
    }

    isStreamSubscriber = CacheAsyncFn(this.isStreamSubscriberPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey([streamId, ethAddress]: any) {
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    /**
     * Clear cache for streamId
     */
    clearStream(streamId: StreamID) {
        this.debug('clearStream', streamId)
        // include separator so startsWith(streamid) doesn't match streamid-something
        const target = `${streamId}${SEPARATOR}`
        const matchTarget = (s: string) => s.startsWith(target)
        this.getStream.clearMatching(matchTarget)
        this.getStreamValidationInfo.clearMatching(matchTarget)
        this.isStreamPublisher.clearMatching(matchTarget)
        this.isStreamSubscriber.clearMatching(matchTarget)
    }

    /**
     * Clear all cached data
     */
    clear() {
        this.debug('clear')
        this.getStream.clear()
        this.getStreamValidationInfo.clear()
        this.isStreamPublisher.clear()
        this.isStreamSubscriber.clear()
    }
}
