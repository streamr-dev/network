import { StreamID } from 'streamr-client-protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'
import { instanceId } from '../utils/utils'
import { CacheAsyncFn } from '../utils/caches'
import { Context } from '../utils/Context'
import { CacheConfig, ConfigInjectionToken } from '../Config'
import { StreamRegistry } from './StreamRegistry'
import { StreamPermission } from '../permission'
import { Stream } from '../Stream'
import { EthereumAddress } from '@streamr/utils'

const SEPARATOR = '|' // always use SEPARATOR for cache key

/* eslint-disable no-underscore-dangle */
@scoped(Lifecycle.ContainerScoped)
export class StreamRegistryCached implements Context {
    readonly id = instanceId(this)
    readonly debug

    constructor(
        context: Context,
        @inject(delay(() => StreamRegistry)) private streamRegistry: StreamRegistry,
        @inject(ConfigInjectionToken.Cache) private cacheOptions: CacheConfig
    ) {
        this.debug = context.debug.extend(this.id)
    }

    getStream(streamId: StreamID): Promise<Stream> {
        return this._getStream(streamId)
    }

    private _getStream = CacheAsyncFn((streamId: StreamID) => {
        return this.streamRegistry.getStream(streamId)
    }, {
        ...this.cacheOptions,
        cacheKey: ([streamId]: any) => {
            // see clearStream
            return `${streamId}${SEPARATOR}`
        }
    })

    isStreamPublisher(streamId: StreamID, ethAddress: EthereumAddress): Promise<boolean> {
        return this._isStreamPublisher(streamId, ethAddress)
    }

    private _isStreamPublisher = CacheAsyncFn((streamId: StreamID, ethAddress: EthereumAddress) => {
        return this.streamRegistry.isStreamPublisher(streamId, ethAddress)
    }, {
        ...this.cacheOptions,
        cacheKey([streamId, ethAddress]: any): string {
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    isStreamSubscriber(streamId: StreamID, ethAddress: EthereumAddress): Promise<boolean> {
        return this._isStreamSubscriber(streamId, ethAddress)
    }

    private _isStreamSubscriber = CacheAsyncFn((streamId: StreamID, ethAddress: EthereumAddress) => {
        return this.streamRegistry.isStreamSubscriber(streamId, ethAddress)
    }, {
        ...this.cacheOptions,
        cacheKey([streamId, ethAddress]: any): string {
            return [streamId, ethAddress.toLowerCase()].join(SEPARATOR)
        }
    })

    async isPublic(streamId: StreamID): Promise<boolean> {
        return this._isPublic(streamId)
    }

    private _isPublic = CacheAsyncFn((streamId: StreamID) => {
        return this.streamRegistry.hasPermission({
            streamId,
            public: true,
            permission: StreamPermission.SUBSCRIBE
        })
    }, {
        ...this.cacheOptions,
        cacheKey([streamId]): any {
            return ['PublicSubscribe', streamId].join(SEPARATOR)
        }
    })

    /**
     * Clear cache for streamId
     */
    clearStream(streamId: StreamID): void {
        this.debug('clearStream', streamId)
        // include separator so startsWith(streamid) doesn't match streamid-something
        const target = `${streamId}${SEPARATOR}`
        const matchTarget = (s: string) => s.startsWith(target)
        this._getStream.clearMatching(matchTarget)
        this._isStreamPublisher.clearMatching(matchTarget)
        this._isStreamSubscriber.clearMatching(matchTarget)
    }
}
