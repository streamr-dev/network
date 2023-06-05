import { Lifecycle, inject, scoped, delay } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessageStream } from './MessageStream'
import { Resends } from './Resends'
import { MessagePipelineOptions, createMessagePipeline as _createMessagePipeline } from './messagePipeline'

type MessagePipelineFactoryOptions = Omit<MessagePipelineOptions,
    'resends' |
    'groupKeyManager' |
    'streamRegistryCached' |
    'destroySignal' |
    'loggerFactory' |
    'config'>

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly resends: Resends
    private readonly groupKeyManager: GroupKeyManager
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    private readonly config: MessagePipelineOptions['config']

    /* eslint-disable indent */
    constructor(
        @inject(delay(() => Resends)) resends: Resends,
        groupKeyManager: GroupKeyManager,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
        // eslint-disable-next-line max-len
        @inject(ConfigInjectionToken) config: MessagePipelineOptions['config']
    ) {
        this.resends = resends
        this.groupKeyManager = groupKeyManager
        this.streamRegistryCached = streamRegistryCached
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
        this.config = config
    }

    // eslint-disable-next-line max-len
    createMessagePipeline(opts: MessagePipelineFactoryOptions): MessageStream {
        return _createMessagePipeline({
            ...opts,
            resends: this.resends,
            groupKeyManager: this.groupKeyManager,
            streamRegistryCached: this.streamRegistryCached,
            destroySignal: this.destroySignal,
            loggerFactory: this.loggerFactory,
            config: this.config
        })
    }
}
