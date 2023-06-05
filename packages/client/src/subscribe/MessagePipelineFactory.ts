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

    loggerFactory: LoggerFactory
    resends: Resends
    groupKeyManager: GroupKeyManager
    streamRegistryCached: StreamRegistryCached
    destroySignal: DestroySignal
    config: Pick<StrictStreamrClientConfig, 'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>

    constructor(
        loggerFactory: LoggerFactory,
        resends: Resends,
        groupKeyManager: GroupKeyManager,
        streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        // eslint-disable-next-line max-len
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'orderMessages' | 'gapFillTimeout' | 'retryResendAfter' | 'maxGapRequests' | 'gapFill'>
    ) {
        this.loggerFactory = loggerFactory
        this.resends = resends
        this.groupKeyManager = groupKeyManager
        this.streamRegistryCached = streamRegistryCached
        this.destroySignal = destroySignal
        this.config = config
    }

    // eslint-disable-next-line max-len
    createMessagePipeline(opts: Omit<MessagePipelineOptions, 'loggerFactory' | 'resends' | 'groupKeyManager' | 'streamRegistryCached' | 'destroySignal' | 'config'>): MessageStream {
        return _createMessagePipeline({
            ...opts,
            loggerFactory: this.loggerFactory,
            resends: this.resends,
            groupKeyManager: this.groupKeyManager,
            streamRegistryCached: this.streamRegistryCached,
            destroySignal: this.destroySignal,
            config: this.config
        })
    }
}
