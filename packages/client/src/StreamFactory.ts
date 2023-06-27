import { StreamID } from '@streamr/protocol'
import { delay, inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { StreamrClientEventEmitter } from './events'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { Stream, StreamMetadata } from './Stream'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { LoggerFactory } from './utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class StreamFactory {

    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly resends: Resends
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    /** @internal */
    private readonly config: Pick<StrictStreamrClientConfig, '_timeouts'>
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly loggerFactory: LoggerFactory

    /* eslint-disable indent */
    /** @internal */
    constructor(
        @inject(delay(() => Publisher)) publisher: Publisher,
        subscriber: Subscriber,
        resends: Resends,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, '_timeouts'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.publisher = publisher
        this.subscriber = subscriber
        this.resends = resends
        this.streamRegistry = streamRegistry
        this.streamStorageRegistry = streamStorageRegistry
        this.config = config
        this.eventEmitter = eventEmitter
        this.loggerFactory = loggerFactory
    }

    createStream(id: StreamID, metadata: Partial<StreamMetadata>): Stream {
        return new Stream(
            id,
            metadata,
            this.publisher,
            this.subscriber,
            this.resends,
            this.streamRegistry,
            this.streamStorageRegistry,
            this.loggerFactory,
            this.eventEmitter,
            this.config
        )
    }
}
