import { StreamID, StreamMessage } from '@streamr/protocol'
import { MarkOptional } from 'ts-essentials'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamStorageRegistry } from '../contracts/StreamStorageRegistry'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushPipeline } from '../utils/PushPipeline'
import { Resends } from './Resends'
import { MessagePipelineOptions, createMessagePipeline as _createMessagePipeline } from './messagePipeline'
import { EIP1271ContractFacade } from '../contracts/EIP1271ContractFacade'

type MessagePipelineFactoryOptions = MarkOptional<Omit<MessagePipelineOptions,
    'resends' |
    'groupKeyManager' |
    'streamRegistry' |
    'eip1271ContractFacade' |
    'destroySignal' |
    'loggerFactory'>,
    'getStorageNodes' |
    'config'> 

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly resends: Resends
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly streamRegistry: StreamRegistry
    private readonly eip1271ContractFacade: EIP1271ContractFacade
    private readonly groupKeyManager: GroupKeyManager
    private readonly config: MessagePipelineOptions['config']
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory
    
    /* eslint-disable indent */
    constructor(
        @inject(delay(() => Resends)) resends: Resends,
        streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        eip1271ContractFacade: EIP1271ContractFacade,
        @inject(delay(() => GroupKeyManager)) groupKeyManager: GroupKeyManager,
        @inject(ConfigInjectionToken) config: MessagePipelineOptions['config'],
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.resends = resends
        this.streamStorageRegistry = streamStorageRegistry
        this.streamRegistry = streamRegistry
        this.eip1271ContractFacade = eip1271ContractFacade
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
            streamRegistry: this.streamRegistry,
            eip1271ContractFacade: this.eip1271ContractFacade,
            groupKeyManager: this.groupKeyManager,
            config: opts.config ?? this.config,
            destroySignal: this.destroySignal,
            loggerFactory: this.loggerFactory
        })
    }
}
