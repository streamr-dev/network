import { CacheAsyncFn, instanceId } from '../utils'
import { CacheConfig, Config } from './Config'
import { SPID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'
import { StreamEndpoints } from './StreamEndpoints'
import { Context } from '../utils/Context'

@scoped(Lifecycle.ContainerScoped)
export class BrubeckCached implements Context {
    id
    debug
    // TODO change all "any" types in this class to valid types when CacheAsyncFn is converted to TypeScript
    getStream: any
    isStreamPublisher: any
    isStreamSubscriber: any
    getAddress: any

    constructor(
        context: Context,
        @inject(delay(() => StreamEndpoints)) streamEndpoints: StreamEndpoints,
        @inject(Config.Cache) cacheOptions: CacheConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.getStream = CacheAsyncFn(streamEndpoints.getStream.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey: ([maybeStreamId]: any) => {
                const { streamId } = SPID.parse(maybeStreamId)
                return streamId
            }
        })
        this.isStreamPublisher = CacheAsyncFn(streamEndpoints.isStreamPublisher.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = SPID.parse(maybeStreamId)
                return `${streamId}|${ethAddress.toLowerCase()}`
            }
        })

        this.isStreamSubscriber = CacheAsyncFn(streamEndpoints.isStreamSubscriber.bind(streamEndpoints), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]: any) {
                const { streamId } = SPID.parse(maybeStreamId)
                return `${streamId}|${ethAddress.toLowerCase()}`
            }
        })
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
