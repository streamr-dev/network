import '../setupTsyringe'

import { StreamID } from '@streamr/utils'
import { MarkOptional } from 'ts-essentials'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken } from '../ConfigTypes'
import { DestroySignal } from '../DestroySignal'
import { StreamRegistry } from '../contracts/StreamRegistry'
import { StreamStorageRegistry } from '../contracts/StreamStorageRegistry'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamMessage } from '../protocol/StreamMessage'
import { SignatureValidator } from '../signature/SignatureValidator'
import { LoggerFactory } from '../utils/LoggerFactory'
import { PushPipeline } from '../utils/PushPipeline'
import type { Resends } from './Resends'
import { MessagePipelineOptions, createMessagePipeline as _createMessagePipeline } from './messagePipeline'
import { Tokens } from '../tokens'

type MessagePipelineFactoryOptions = MarkOptional<Omit<MessagePipelineOptions,
    'resends' |
    'groupKeyManager' |
    'streamRegistry' |
    'signatureValidator' |
    'destroySignal' |
    'loggerFactory'>,
    'getStorageNodes' |
    'config'>

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly resends: Resends
    private readonly streamStorageRegistry: StreamStorageRegistry
    private readonly streamRegistry: StreamRegistry
    private readonly signatureValidator: SignatureValidator
    private readonly groupKeyManager: GroupKeyManager
    private readonly config: MessagePipelineOptions['config']
    private readonly destroySignal: DestroySignal
    private readonly loggerFactory: LoggerFactory

    /* eslint-disable indent */
    constructor(
        @inject(Tokens.Resends) resends: Resends,
        streamStorageRegistry: StreamStorageRegistry,
        @inject(delay(() => StreamRegistry)) streamRegistry: StreamRegistry,
        signatureValidator: SignatureValidator,
        @inject(delay(() => GroupKeyManager)) groupKeyManager: GroupKeyManager,
        @inject(ConfigInjectionToken) config: MessagePipelineOptions['config'],
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.resends = resends
        this.streamStorageRegistry = streamStorageRegistry
        this.streamRegistry = streamRegistry
        this.signatureValidator = signatureValidator
        this.groupKeyManager = groupKeyManager
        this.config = config
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
    }

    createMessagePipeline(opts: MessagePipelineFactoryOptions): PushPipeline<StreamMessage, StreamMessage> {
        return _createMessagePipeline({
            ...opts,
            getStorageNodes: opts.getStorageNodes ?? ((streamId: StreamID) => this.streamStorageRegistry.getStorageNodes(streamId)),
            resends: this.resends,
            streamRegistry: this.streamRegistry,
            signatureValidator: this.signatureValidator,
            groupKeyManager: this.groupKeyManager,
            config: opts.config ?? this.config,
            destroySignal: this.destroySignal,
            loggerFactory: this.loggerFactory
        })
    }
}
