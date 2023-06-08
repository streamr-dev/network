import { MarkOptional } from 'ts-essentials'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessageStream } from './MessageStream'
import { Resends } from './Resends'
import { MessagePipelineOptions, createMessagePipeline as _createMessagePipeline } from './messagePipeline'

type MessagePipelineFactoryOptions = MarkOptional<Omit<MessagePipelineOptions,
    'resends' |
    'groupKeyManager' |
    'streamRegistryCached' |
    'destroySignal' |
    'loggerFactory'>,
    'config'> 

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly resends: Resends
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly groupKeyManager: GroupKeyManager
    private readonly config: MessagePipelineOptions['config']
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    
    /* eslint-disable indent */
    constructor(
        @inject(delay(() => Resends)) resends: Resends,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(delay(() => GroupKeyManager)) groupKeyManager: GroupKeyManager,
        @inject(ConfigInjectionToken) config: MessagePipelineOptions['config'],
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.resends = resends
        this.streamRegistryCached = streamRegistryCached
        this.groupKeyManager = groupKeyManager
        this.config = config
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
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
            config: opts.config ?? this.config
        })
    }
}
