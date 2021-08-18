/**
 * Cached Subset of StreamEndpoints.
 */
import { SPID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { CacheAsyncFn, instanceId } from './utils'
import { Context } from './utils/Context'
import { CacheConfig, Config } from './Config'
import { StreamEndpoints } from './StreamEndpoints'

@scoped(Lifecycle.ContainerScoped)
export class StreamEndpointsCached implements Context {
    id
    debug
    getStream
    isStreamPublisher
    isStreamSubscriber

    constructor(
        context: Context,
        @inject(delay(() => StreamEndpoints)) streamEndpoints: StreamEndpoints,
        @inject(Config.Cache) cacheOptions: CacheConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)

        // assign to var before to this.var so typescript can infer type correctly
        const getStream = CacheAsyncFn(streamEndpoints.getStream.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey: ([maybeStreamId]: any) => {
                const { streamId } = SPID.parse(maybeStreamId)
                return streamId
            }
        })
        this.getStream = getStream

        const isStreamPublisher = CacheAsyncFn(streamEndpoints.isStreamPublisher.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = SPID.parse(maybeStreamId)
                return `${streamId}|${ethAddress.toLowerCase()}`
            }
        })
        this.isStreamPublisher = isStreamPublisher

        const isStreamSubscriber = CacheAsyncFn(streamEndpoints.isStreamSubscriber.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = SPID.parse(maybeStreamId)
                return `${streamId}|${ethAddress.toLowerCase()}`
            }
        })
        this.isStreamSubscriber = isStreamSubscriber
    }

    clearStream(streamId?: string) {
        this.getStream.clear()
        if (streamId != null) {
            this.isStreamPublisher.clearMatching((s: string) => s.startsWith(streamId))
            this.isStreamSubscriber.clearMatching((s: string) => s.startsWith(streamId))
        } else {
            this.isStreamPublisher.clear()
            this.isStreamSubscriber.clear()
        }
    }

    clear() {
        this.debug('clear')
        this.clearStream()
    }
}
