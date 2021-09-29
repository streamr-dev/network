/**
 * Cached Subset of StreamEndpoints.
 */
import { SPID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { CacheAsyncFn, instanceId } from './utils'
import { Context } from './utils/Context'
import { CacheConfig, Config } from './Config'
import { StreamEndpoints } from './StreamEndpoints'

const SEPARATOR = '|'

@scoped(Lifecycle.ContainerScoped)
export class StreamEndpointsCached implements Context {
    id = instanceId(this)
    debug

    constructor(
        context: Context,
        @inject(delay(() => StreamEndpoints)) private streamEndpoints: StreamEndpoints,
        @inject(Config.Cache) private cacheOptions: CacheConfig
    ) {
        this.debug = context.debug.extend(this.id)
    }

    getStream = CacheAsyncFn(this.streamEndpoints.getStream.bind(this.streamEndpoints), {
        ...this.cacheOptions,
        cacheKey: ([maybeStreamId]: any) => {
            const { streamId } = SPID.parse(maybeStreamId)
            // see clearStream
            return `${streamId}${SEPARATOR}`
        }
    })

    getStreamValidationInfo = CacheAsyncFn(this.streamEndpoints.getStreamValidationInfo.bind(this.streamEndpoints), {
        ...this.cacheOptions,
        cacheKey: ([maybeStreamId]: any) => {
            const { streamId } = SPID.parse(maybeStreamId)
            return `${streamId}${SEPARATOR}`
        }
    })

    isStreamPublisher = CacheAsyncFn(this.streamEndpoints.isStreamPublisher.bind(this.streamEndpoints), {
        ...this.cacheOptions,
        cacheKey([maybeStreamId, ethAddress]: any) {
            const { streamId } = SPID.parse(maybeStreamId)
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    isStreamSubscriber = CacheAsyncFn(this.streamEndpoints.isStreamSubscriber.bind(this.streamEndpoints), {
        ...this.cacheOptions,
        cacheKey([maybeStreamId, ethAddress]: any) {
            const { streamId } = SPID.parse(maybeStreamId)
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    clearStream(streamId?: string) {
        if (streamId != null) {
            // include separator so startsWith(streamid) doesn't match streamid-something
            const target = `${streamId}${SEPARATOR}`
            this.getStream.clearMatching((s: string) => s.startsWith(target))
            this.getStreamValidationInfo.clearMatching((s: string) => s.startsWith(target))
            this.isStreamPublisher.clearMatching((s: string) => s.startsWith(target))
            this.isStreamSubscriber.clearMatching((s: string) => s.startsWith(target))
        } else {
            this.getStream.clear()
            this.getStreamValidationInfo.clear()
            this.isStreamPublisher.clear()
            this.isStreamSubscriber.clear()
        }
    }

    clear() {
        this.debug('clear')
        this.clearStream()
    }
}
