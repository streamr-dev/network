import { delay, inject, Lifecycle, scoped } from 'tsyringe'
import { StreamID } from '@streamr/protocol'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { StreamrClientEventEmitter } from './events'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { Stream, StreamMetadata } from './Stream'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { LoggerFactory } from './utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class StreamFactory {

    private readonly resends: Resends
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly loggerFactory: LoggerFactory
    private readonly eventEmitter: StreamrClientEventEmitter
    /** @internal */
    private readonly config: Pick<StrictStreamrClientConfig, '_timeouts'>
    /** @internal */
    constructor(
        resends: Resends,
        @inject(delay(() => Publisher)) publisher: Publisher,
        subscriber: Subscriber,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        loggerFactory: LoggerFactory,
        eventEmitter: StreamrClientEventEmitter,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, '_timeouts'>
    ) {
        this.resends = resends
        this.publisher = publisher
        this.subscriber = subscriber
        this.streamRegistryCached = streamRegistryCached
        this.streamRegistry = streamRegistry
        this.streamStorageRegistry = streamStorageRegistry
        this.loggerFactory = loggerFactory
        this.eventEmitter = eventEmitter
        this.config = config
    }

    createStream(id: StreamID, metadata: Partial<StreamMetadata>): Stream {
        return new Stream(
            id,
            metadata,
            this.resends,
            this.publisher,
            this.subscriber,
            this.streamRegistryCached,
            this.streamRegistry,
            this.streamStorageRegistry,
            this.loggerFactory,
            this.eventEmitter,
            this.config
        )
    }
}
