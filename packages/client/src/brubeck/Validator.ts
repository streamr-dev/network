import { StreamMessage, GroupKeyErrorResponse, StreamMessageValidator, SigningUtil, ValidationError } from 'streamr-client-protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { pOrderedResolve, CacheAsyncFn } from '../utils'
import { inspect } from '../utils/log'
import {Stoppable} from '../utils/Stoppable'
import { BrubeckCached } from './Cached'
import { Config, SubscribeConfig } from './Config'

export class SignatureRequiredError extends ValidationError {
    constructor(streamMessage?: StreamMessage, code?: string) {
        super(`Client requires data to be signed. Message: ${inspect(streamMessage)}`, streamMessage, code)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

/**
 * Wrap StreamMessageValidator in a way that ensures it can validate in parallel but
 * validation is guaranteed to resolve in the same order they were called
 * Handles caching remote calls
 */
@scoped(Lifecycle.ContainerScoped)
export default class Validator extends StreamMessageValidator implements Stoppable {
    isStopped = false
    private doValidation: StreamMessageValidator['validate']
    constructor(
        streamEndpoints: BrubeckCached,
        @inject(Config.Subscribe) private options: SubscribeConfig
    ) {
        super({
            getStream: streamEndpoints.getStream.bind(streamEndpoints),
            async isPublisher(publisherId, _streamId) {
                return streamEndpoints.isStreamPublisher(_streamId, publisherId)
            },
            async isSubscriber(ethAddress, _streamId) {
                return streamEndpoints.isStreamSubscriber(_streamId, ethAddress)
            },
            verify: CacheAsyncFn(SigningUtil.verify.bind(SigningUtil), {
                // forcibly use small cache otherwise keeps n serialized messages in memory
                maxSize: 100,
                maxAge: 10000,
                cachePromiseRejection: true,
                cacheKey: (args) => args.join('|'),
            })
        })
        this.doValidation = super.validate.bind(this)
    }

    orderedValidate = pOrderedResolve(async (msg: StreamMessage) => {
        if (this.isStopped) { return }

        const { options } = this
        if (msg.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE) {
            const errMsg = msg as StreamMessage<any>
            const res = GroupKeyErrorResponse.fromArray(errMsg.getParsedContent())
            const err = new ValidationError(`GroupKeyErrorResponse: ${res.errorMessage}`, msg)
            err.streamMessage = msg
            err.code = res.errorCode
            throw err
        }

        // Check special cases controlled by the verifySignatures policy
        if (options.verifySignatures === 'never' && msg.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return // no validation required
        }

        if (options.verifySignatures === 'always' && !msg.signature) {
            throw new SignatureRequiredError(msg)
        }

        // In all other cases validate using the validator
        // will throw with appropriate validation failure
        await this.doValidation(msg).catch((err) => {
            if (!err.streamMessage) {
                err.streamMessage = msg // eslint-disable-line no-param-reassign
            }
            throw err
        })
    })

    async validate(msg: StreamMessage) {
        await this.orderedValidate(msg)
    }

    stop() {
        this.isStopped = true
        this.orderedValidate.clear()
    }
}
