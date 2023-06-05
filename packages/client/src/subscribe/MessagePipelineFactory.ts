import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { DestroySignal } from '../DestroySignal'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { LoggerFactory } from '../utils/LoggerFactory'
import { MessageStream } from './MessageStream'
import { Resends } from './Resends'
import { MessagePipelineOptions, createMessagePipeline as _createMessagePipeline } from './messagePipeline'

@scoped(Lifecycle.ContainerScoped)
export class MessagePipelineFactory {

    private readonly loggerFactory: LoggerFactory
    private readonly resends: Resends
    private readonly groupKeyManager: GroupKeyManager
    private readonly streamRegistryCached: StreamRegistryCached
    private readonly destroySignal: DestroySignal
    private readonly config: Pick<StrictStreamrClientConfig, 'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>

    constructor(
        resends: Resends,
        groupKeyManager: GroupKeyManager,
        streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
        // eslint-disable-next-line max-len
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>
    ) {
        this.resends = resends
        this.groupKeyManager = groupKeyManager
        this.streamRegistryCached = streamRegistryCached
        this.destroySignal = destroySignal
        this.loggerFactory = loggerFactory
        this.config = config
    }

    // eslint-disable-next-line max-len
    createMessagePipeline(opts: Omit<MessagePipelineOptions, 'resends' | 'groupKeyManager' | 'streamRegistryCached' | 'destroySignal' | 'loggerFactory' | 'config'>): MessageStream {
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
