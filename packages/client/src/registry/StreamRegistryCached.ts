import { StreamID } from '@streamr/protocol'
import { Lifecycle, scoped, inject, delay } from 'tsyringe'
import { CacheAsyncFn } from '../utils/caches'
import { StrictStreamrClientConfig, ConfigInjectionToken } from '../Config'
import { StreamRegistry } from './StreamRegistry'
import { StreamPermission } from '../permission'
import { Stream } from '../Stream'
import { EthereumAddress, Logger } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'

const SEPARATOR = '|' // always use SEPARATOR for cache key

/* eslint-disable no-underscore-dangle */
@scoped(Lifecycle.ContainerScoped)
export class StreamRegistryCached {
    private readonly logger: Logger

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(delay(() => StreamRegistry)) private streamRegistry: StreamRegistry,
        @inject(ConfigInjectionToken) private config: StrictStreamrClientConfig
    ) {
        this.logger = loggerFactory.createLogger(module)
    }

    getStream(streamId: StreamID): Promise<Stream> {
        return this._getStream(streamId)
    }

    private _getStream = CacheAsyncFn((streamId: StreamID) => {
        return this.streamRegistry.getStream(streamId)
    }, {
        ...this.config.cache,
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
        ...this.config.cache,
        cacheKey([streamId, ethAddress]): string {
            return [streamId, ethAddress].join(SEPARATOR)
        }
    })

    isStreamSubscriber(streamId: StreamID, ethAddress: EthereumAddress): Promise<boolean> {
        return this._isStreamSubscriber(streamId, ethAddress)
    }

    private _isStreamSubscriber = CacheAsyncFn((streamId: StreamID, ethAddress: EthereumAddress) => {
        return this.streamRegistry.isStreamSubscriber(streamId, ethAddress)
    }, {
        ...this.config.cache,
        cacheKey([streamId, ethAddress]): string {
            return [streamId, ethAddress].join(SEPARATOR)
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
        ...this.config.cache,
        cacheKey([streamId]): any {
            return ['PublicSubscribe', streamId].join(SEPARATOR)
        }
    })

    /**
     * Clear cache for streamId
     */
    clearStream(streamId: StreamID): void {
        this.logger.debug('clearing caches matching streamId="%s"', streamId)
        // include separator so startsWith(streamid) doesn't match streamid-something
        const target = `${streamId}${SEPARATOR}`
        const matchTarget = (s: string) => s.startsWith(target)
        this._getStream.clearMatching(matchTarget)
        this._isStreamPublisher.clearMatching(matchTarget)
        this._isStreamSubscriber.clearMatching(matchTarget)
    }
}
