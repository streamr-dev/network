/**
 * Validation Wrapper
 */
import { inject, Lifecycle, scoped, delay } from 'tsyringe'
import {
    StreamMessage,
    StreamMessageValidator,
    SigningUtil,
    StreamMessageError,
    StreamID,
    EthereumAddress
} from 'streamr-client-protocol'

import { pOrderedResolve, instanceId, CacheFn } from './utils'
import { Stoppable } from './utils/Stoppable'
import { Context } from './utils/Context'
import { StreamRegistryCached } from './StreamRegistryCached'
import { ConfigInjectionToken, SubscribeConfig, CacheConfig } from './Config'

export class SignatureRequiredError extends StreamMessageError {
    constructor(streamMessage: StreamMessage, code?: string) {
        super('Client requires data to be signed.', streamMessage, code)
    }
}

/**
 * Wrap StreamMessageValidator in a way that ensures it can validate in parallel but
 * validation is guaranteed to resolve in the same order they were called
 * Handles caching remote calls
 */
@scoped(Lifecycle.ContainerScoped)
export class Validator extends StreamMessageValidator implements Stoppable, Context {
    id
    debug
    isStopped = false
    private doValidation: StreamMessageValidator['validate']
    constructor(
        context: Context,
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(ConfigInjectionToken.Subscribe) private options: SubscribeConfig,
        @inject(ConfigInjectionToken.Cache) private cacheOptions: CacheConfig,
    ) {
        super({
            getStream: (streamId: StreamID) => {
                return streamRegistryCached.getStream(streamId)
            },
            isPublisher: (publisherId: EthereumAddress, streamId: StreamID) => {
                return streamRegistryCached.isStreamPublisher(streamId, publisherId)
            },
            isSubscriber: (ethAddress: EthereumAddress, streamId: StreamID) => {
                return streamRegistryCached.isStreamSubscriber(streamId, ethAddress)
            },
            verify: (address: EthereumAddress, payload: string, signature: string) => {
                return this.cachedVerify(address, payload, signature)
            }
        })

        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.doValidation = super.validate.bind(this)
    }

    private cachedVerify = CacheFn( (address: EthereumAddress, payload: string, signature: string) => {
        if (this.isStopped) { return true }
        return SigningUtil.verify(address, payload, signature)
    }, {
        // forcibly use small cache otherwise keeps n serialized messages in memory
        ...this.cacheOptions,
        maxSize: 100,
        cacheKey: (args) => args.join('|'),
    })

    orderedValidate = pOrderedResolve(async (msg: StreamMessage) => {
        if (this.isStopped) { return }
        const { options } = this

        // Check special cases controlled by the verifySignatures policy
        if (options.verifySignatures === 'never' && msg.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return // no validation required
        }

        if (options.verifySignatures === 'always' && !msg.signature) {
            throw new SignatureRequiredError(msg)
        }

        // In all other cases validate using the validator
        // will throw with appropriate validation failure
        await this.doValidation(msg).catch((err: any) => {
            if (this.isStopped) { return }

            if (!err.streamMessage) {
                err.streamMessage = msg // eslint-disable-line no-param-reassign
            }
            throw err
        })
    })

    async validate(msg: StreamMessage): Promise<void> {
        if (this.isStopped) { return }
        await this.orderedValidate(msg)
    }

    stop(): void {
        this.isStopped = true
        this.cachedVerify.clear()
        this.orderedValidate.clear()
    }
}
