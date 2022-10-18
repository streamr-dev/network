/**
 * Validation Wrapper
 */
import { inject, Lifecycle, scoped, delay } from 'tsyringe'
import { StreamMessage, StreamID } from 'streamr-client-protocol'
import { pOrderedResolve } from './utils/promises'
import { CacheFn } from './utils/caches'
import { formLookupKey } from './utils/utils'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
import { ConfigInjectionToken, CacheConfig } from './Config'
import StreamMessageValidator from './StreamMessageValidator'
import { verify } from './utils/signingUtils'
import { EthereumAddress } from '@streamr/utils'

/**
 * Wrap StreamMessageValidator in a way that ensures it can validate in parallel but
 * validation is guaranteed to resolve in the same order they were called
 * Handles caching remote calls
 */
@scoped(Lifecycle.ContainerScoped)
export class Validator extends StreamMessageValidator {
    private isStopped = false
    private doValidation: StreamMessageValidator['validate']

    constructor(
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached,
        @inject(ConfigInjectionToken.Cache) private cacheOptions: CacheConfig
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
        this.doValidation = super.validate.bind(this)
    }

    private cachedVerify = CacheFn( (address: EthereumAddress, payload: string, signature: string) => {
        if (this.isStopped) { return true }
        return verify(address, payload, signature)
    }, {
        // forcibly use small cache otherwise keeps n serialized messages in memory
        ...this.cacheOptions,
        maxSize: 100,
        cacheKey: (args) => formLookupKey(...args),
    })

    orderedValidate = pOrderedResolve(async (msg: StreamMessage) => {
        if (this.isStopped) { return }

        // In all other cases validate using the validator
        // will throw with appropriate validation failure
        await this.doValidation(msg).catch((err: any) => {
            if (this.isStopped) { return }

            if (!err.streamMessage) {
                err.streamMessage = msg
            }
            throw err
        })
    })

    override async validate(msg: StreamMessage): Promise<void> {
        if (this.isStopped) { return }
        await this.orderedValidate(msg)
    }

    stop(): void {
        this.isStopped = true
        this.orderedValidate.clear()
    }
}
