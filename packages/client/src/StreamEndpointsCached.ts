/**
 * Cached Subset of StreamEndpoints.
 */
import { SPID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'

import { CacheAsyncFn, instanceId } from './utils'
import type { Context } from './utils/Context'
import type { CacheConfig } from './Config'
import { Config } from './Config'
import { StreamEndpoints } from './StreamEndpoints'

const SEPARATOR = '|' // always use SEPARATOR for cache key

// Temporary during testnet: preloaded stream metadata to reduce calls to backend.
/** @internal */
export const preloadStreams = new Set([
    'streamr.eth/brubeck-testnet/rewards/5hhb49',
    'streamr.eth/brubeck-testnet/rewards/95hc37',
    'streamr.eth/brubeck-testnet/rewards/12ab22',
    'streamr.eth/brubeck-testnet/rewards/z15g13',
    'streamr.eth/brubeck-testnet/rewards/111249',
    'streamr.eth/brubeck-testnet/rewards/0g2jha',
    'streamr.eth/brubeck-testnet/rewards/fijka2',
    'streamr.eth/brubeck-testnet/rewards/91ab49',
    'streamr.eth/brubeck-testnet/rewards/giab22',
    'streamr.eth/brubeck-testnet/rewards/25kpf4',
])

/** @internal */
export const preloadPublishers = new Set([
    '0x66cc2122fe015aeb6dacd42d76b074b607c8c9e1',
    '0xfeaacdbbc318ebbf9bb5835d4173c1a7fc24b3b9',
    '0xf79d101e1243cbdde02d0f49e776fa65de0122ed',
    '0xfcd24cffe0913548058bd105109fea784de3d5e5'
])

function preloadGetStream(streamId: string) {
    return {
        id: streamId,
        partitions: 1,
        name: streamId,
        config: { fields: [] },
        description: 'Rewards stream for Brubeck Testnets 2 and 3',
        dateCreated: '2021-09-10T14:19:27Z',
        lastUpdated: '2021-09-10T14:19:27Z',
        requireSignedData: false,
        requireEncryptedData: false,
        autoConfigure: true,
        storageDays: 365,
        inactivityThresholdHours: 48
    }
}

function preloadGetStreamValidationInfo(streamId: string) {
    return {
        id: streamId,
        partitions: 1,
        requireSignedData: false,
        requireEncryptedData: false,
        storageDays: 365
    }
}

function isPreloadedStream(streamId: string) {
    return preloadStreams.has(streamId)
}

function preloadIsPublisher(ethAddress: string) {
    return preloadPublishers.has(ethAddress)
}

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

    async getStreamPreloaded(streamId: string) {
        if (isPreloadedStream(streamId)) { return preloadGetStream(streamId) }
        return this.streamEndpoints.getStream(streamId)
    }

    getStream = CacheAsyncFn(this.getStreamPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey: ([maybeStreamId]: any) => {
            const { streamId } = SPID.parse(maybeStreamId)
            // see clearStream
            return `${streamId}${SEPARATOR}`
        }
    })

    async getStreamValidationInfoPreloaded(streamId: string) {
        if (isPreloadedStream(streamId)) { return preloadGetStreamValidationInfo(streamId) }
        return this.streamEndpoints.getStreamValidationInfo(streamId)
    }

    getStreamValidationInfo = CacheAsyncFn(this.getStreamValidationInfoPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey: ([maybeStreamId]: any) => {
            const { streamId } = SPID.parse(maybeStreamId)
            return `${streamId}${SEPARATOR}`
        }
    })

    async isStreamPublisherPreloaded(streamId: string, ethAddress: string) {
        if (isPreloadedStream(streamId)) { return preloadIsPublisher(ethAddress) }
        return this.streamEndpoints.isStreamPublisher(streamId, ethAddress)
    }

    isStreamPublisher = CacheAsyncFn(this.isStreamPublisherPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey([maybeStreamId, ethAddress]: any) {
            const { streamId } = SPID.parse(maybeStreamId)
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    async isStreamSubscriberPreloaded(streamId: string, ethAddress: string) {
        if (isPreloadedStream(streamId)) { return true }
        return this.streamEndpoints.isStreamSubscriber(streamId, ethAddress)
    }

    isStreamSubscriber = CacheAsyncFn(this.isStreamSubscriberPreloaded.bind(this), {
        ...this.cacheOptions,
        cacheKey([maybeStreamId, ethAddress]: any) {
            const { streamId } = SPID.parse(maybeStreamId)
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    /**
     * Clear cache for streamId
     */
    clearStream(streamId: string) {
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
