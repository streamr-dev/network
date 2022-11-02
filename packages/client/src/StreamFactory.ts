import { delay, inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, TimeoutsConfig } from './Config'
import { StreamrClientEventEmitter } from './events'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { Stream, StreamrStreamConstructorOptions } from './Stream'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'
import { LoggerFactory } from './utils/LoggerFactory'
import { DestroySignal } from './DestroySignal'

@scoped(Lifecycle.ContainerScoped)
export class StreamFactory {

    private readonly resends: Resends
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    private readonly eventEmitter: StreamrClientEventEmitter
    private readonly timeoutsConfig: TimeoutsConfig

    constructor(
        resends: Resends,
        @inject(delay(() => Publisher)) publisher: Publisher,
        subscriber: Subscriber,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
        eventEmitter: StreamrClientEventEmitter,
        @inject(ConfigInjectionToken.Timeouts) timeoutsConfig: TimeoutsConfig
    ) {
        this.resends = resends
        this.publisher = publisher
        this.subscriber = subscriber
        this.streamRegistryCached = streamRegistryCached
        this.streamRegistry = streamRegistry
        this.streamStorageRegistry = streamStorageRegistry
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
        this.eventEmitter = eventEmitter
        this.timeoutsConfig = timeoutsConfig
    }

    createStream(props: StreamrStreamConstructorOptions): Stream {
        return new Stream(
            props,
            this.resends,
            this.publisher,
            this.subscriber,
            this.streamRegistryCached,
            this.streamRegistry,
            this.streamStorageRegistry,
            this.destroySignal,
            this.loggerFactory,
            this.eventEmitter,
            this.timeoutsConfig
        )
    }
}
