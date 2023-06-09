import { StreamMessage } from '@streamr/protocol'
import { MarkOptional } from 'ts-essentials'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushPipeline } from '../utils/PushPipeline'
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
    private readonly groupKeyManager: GroupKeyManager
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    private readonly config: MessagePipelineOptions['config']

    /* eslint-disable indent */
    constructor(
        @inject(delay(() => Resends)) resends: Resends,
        @inject(delay(() => GroupKeyManager)) groupKeyManager: GroupKeyManager,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
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
    createMessagePipeline(opts: MessagePipelineFactoryOptions): PushPipeline<StreamMessage, StreamMessage> {
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
