/**
 * Validation Wrapper
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import {
    StreamMessage,
    StreamMessageValidator,
    SigningUtil,
    StreamMessageError,
    StreamID
} from 'streamr-client-protocol'

import { pOrderedResolve, CacheAsyncFn, instanceId } from './utils'
import { Stoppable } from './utils/Stoppable'
import { Context } from './utils/Context'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { Config, SubscribeConfig, CacheConfig } from './Config'

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
export default class Validator extends StreamMessageValidator implements Stoppable, Context {
    id
    debug
    isStopped = false
    private doValidation: StreamMessageValidator['validate']
    constructor(
        context: Context,
        streamEndpoints: StreamEndpointsCached,
        @inject(Config.Subscribe) private options: SubscribeConfig,
        @inject(Config.Cache) private cacheOptions: CacheConfig,
    ) {
        super({
            getStream: (streamId: StreamID) => {
                return streamEndpoints.getStream(streamId)
            },
            isPublisher: (publisherId: string, streamId: StreamID) => {
                return streamEndpoints.isStreamPublisher(streamId, publisherId)
            },
            isSubscriber: (ethAddress: string, streamId: StreamID) => {
                return streamEndpoints.isStreamSubscriber(streamId, ethAddress)
            },
            verify: (address: string, payload: string, signature: string) => {
                return this.cachedVerify(address, payload, signature)
            }
        })

        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.doValidation = super.validate.bind(this)
    }

    private cachedVerify = CacheAsyncFn(async (address: string, payload: string, signature: string) => {
        if (this.isStopped) { return true }
        return SigningUtil.verify(address, payload, signature)
    }, {
        // forcibly use small cache otherwise keeps n serialized messages in memory
        ...this.cacheOptions,
        maxSize: 100,
        cachePromiseRejection: true,
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

    async validate(msg: StreamMessage) {
        if (this.isStopped) { return }
        await this.orderedValidate(msg)
    }

    stop() {
        this.isStopped = true
        this.cachedVerify.clear()
        this.orderedValidate.clear()
    }
}
