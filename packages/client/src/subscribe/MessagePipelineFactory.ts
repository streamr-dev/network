import { StreamID, StreamMessage } from '@streamr/protocol'
import { MarkOptional } from 'ts-essentials'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { StreamStorageRegistry } from '../registry/StreamStorageRegistry'
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
    'getStorageNodes' |
    'config'> 

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly resends: Resends
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly groupKeyManager: GroupKeyManager
    private readonly config: MessagePipelineOptions['config']
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    
    /* eslint-disable indent */
    constructor(
        @inject(delay(() => Resends)) resends: Resends,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => GroupKeyManager)) groupKeyManager: GroupKeyManager,
        @inject(ConfigInjectionToken) config: MessagePipelineOptions['config'],
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.resends = resends
        this.streamRegistryCached = streamRegistryCached
        this.streamStorageRegistry = streamStorageRegistry
        this.groupKeyManager = groupKeyManager
        this.config = config
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
    }

    // eslint-disable-next-line max-len
    createMessagePipeline(opts: MessagePipelineFactoryOptions): PushPipeline<StreamMessage, StreamMessage> {
        return _createMessagePipeline({
            ...opts,
            getStorageNodes: opts.getStorageNodes ?? ((streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId)),
            resends: this.resends,
            streamRegistryCached: this.streamRegistryCached,
            groupKeyManager: this.groupKeyManager,
            config: opts.config ?? this.config,
            destroySignal: this.destroySignal,
            loggerFactory: this.loggerFactory
        })
    }
}
