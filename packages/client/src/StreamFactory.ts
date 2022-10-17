import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, TimeoutsConfig } from './Config'
import { Publisher } from './publish/Publisher'
import { StreamRegistry } from './registry/StreamRegistry'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import { StreamStorageRegistry } from './registry/StreamStorageRegistry'
import { Stream, StreamrStreamConstructorOptions } from './Stream'
import { Resends } from './subscribe/Resends'
import { Subscriber } from './subscribe/Subscriber'

@scoped(Lifecycle.ContainerScoped)
export class StreamFactory {

    private readonly resends: Resends
    private readonly publisher: Publisher
    private readonly subscriber: Subscriber
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamRegistry: StreamRegistry
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly timeoutsConfig: TimeoutsConfig

    constructor(
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        streamRegistryCached: StreamRegistryCached,
        streamRegistry: StreamRegistry,
        streamStorageRegistry: StreamStorageRegistry,
        @inject(ConfigInjectionToken.Timeouts) timeoutsConfig: TimeoutsConfig
    ) {
        this.resends = resends
        this.publisher = publisher
        this.subscriber = subscriber
        this.streamRegistryCached = streamRegistryCached
        this.streamRegistry = streamRegistry
        this.streamStorageRegistry = streamStorageRegistry
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
            this.timeoutsConfig
        )
    }
}
