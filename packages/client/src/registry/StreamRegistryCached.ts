import { StreamID } from '@streamr/protocol'
import { EthereumAddress, Logger } from '@streamr/utils'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { Stream } from '../Stream'
import { StreamPermission } from '../permission'
import { LoggerFactory } from '../utils/LoggerFactory'
import { CacheAsyncFn, CacheAsyncFnType } from '../utils/caches'
import { StreamRegistry } from './StreamRegistry'

const SEPARATOR = '|' // always use SEPARATOR for cache key

/* eslint-disable no-underscore-dangle */
@scoped(Lifecycle.ContainerScoped)
export class StreamRegistryCached {

    private readonly _getStream: CacheAsyncFnType<[StreamID], Stream, string>
    private readonly _isStreamPublisher: CacheAsyncFnType<[StreamID, EthereumAddress], boolean, string>
    private readonly _isStreamSubscriber: CacheAsyncFnType<[StreamID, EthereumAddress], boolean, string>
    private readonly _hasPublicSubscribePermission: CacheAsyncFnType<[StreamID], boolean, string>
    private readonly streamRegistry: StreamRegistry
    private readonly logger: Logger
    
    /* eslint-disable indent */
    constructor(
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'cache'>,
        loggerFactory: LoggerFactory
    ) {
        this.streamRegistry = streamRegistry
        this.logger = loggerFactory.createLogger(module)
        this._getStream = CacheAsyncFn((streamId: StreamID) => {
            return this.streamRegistry.getStream(streamId)
        }, {
            ...config.cache,
            cacheKey: ([streamId]): string => {
                // see clearStream
                return `${streamId}${SEPARATOR}`
            }
        })
        this._isStreamPublisher = CacheAsyncFn((streamId: StreamID, ethAddress: EthereumAddress) => {
            return this.streamRegistry.isStreamPublisher(streamId, ethAddress)
        }, {
            ...config.cache,
            cacheKey([streamId, ethAddress]): string {
                return [streamId, ethAddress].join(SEPARATOR)
            }
        })
        this._isStreamSubscriber = CacheAsyncFn((streamId: StreamID, ethAddress: EthereumAddress) => {
            return this.streamRegistry.isStreamSubscriber(streamId, ethAddress)
        }, {
            ...config.cache,
            cacheKey([streamId, ethAddress]): string {
                return [streamId, ethAddress].join(SEPARATOR)
            }
        })
        this._hasPublicSubscribePermission = CacheAsyncFn((streamId: StreamID) => {
            return this.streamRegistry.hasPermission({
                streamId,
                public: true,
                permission: StreamPermission.SUBSCRIBE
            })
        }, {
            ...config.cache,
            cacheKey([streamId]): string {
                return ['PublicSubscribe', streamId].join(SEPARATOR)
            }
        })
    }

    getStream(streamId: StreamID): Promise<Stream> {
        return this._getStream(streamId)
    }

    isStreamPublisher(streamId: StreamID, ethAddress: EthereumAddress): Promise<boolean> {
        return this._isStreamPublisher(streamId, ethAddress)
    }

    isStreamSubscriber(streamId: StreamID, ethAddress: EthereumAddress): Promise<boolean> {
        return this._isStreamSubscriber(streamId, ethAddress)
    }

    hasPublicSubscribePermission(streamId: StreamID): Promise<boolean> {
        return this._hasPublicSubscribePermission(streamId)
    }

    /**
     * Clear cache for streamId
     */
    clearStream(streamId: StreamID): void {
        this.logger.debug('Clear caches matching stream', { streamId })
        // include separator so startsWith(streamid) doesn't match streamid-something
        const target = `${streamId}${SEPARATOR}`
        const matchTarget = (s: string) => s.startsWith(target)
        this._getStream.clearMatching(matchTarget)
        this._isStreamPublisher.clearMatching(matchTarget)
        this._isStreamSubscriber.clearMatching(matchTarget)
        // TODO should also clear cache for hasPublicSubscribePermission?
    }
}
