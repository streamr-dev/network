/**
 * Validation Wrapper
 */
import { inject, Lifecycle, scoped, delay } from 'tsyringe'
import { StreamMessage, StreamID } from '@streamr/protocol'
import { pOrderedResolve } from './utils/promises'
import { StreamRegistryCached } from './registry/StreamRegistryCached'
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
        @inject(delay(() => StreamRegistryCached)) streamRegistryCached: StreamRegistryCached
    ) {
        super({
            getPartitionCount: async (streamId: StreamID) => {
                const stream = await streamRegistryCached.getStream(streamId)
                return stream.getMetadata().partitions
            },
            isPublisher: (publisherId: EthereumAddress, streamId: StreamID) => {
                return streamRegistryCached.isStreamPublisher(streamId, publisherId)
            },
            isSubscriber: (ethAddress: EthereumAddress, streamId: StreamID) => {
                return streamRegistryCached.isStreamSubscriber(streamId, ethAddress)
            },
            verify: (address: EthereumAddress, payload: string, signature: string) => {
                return verify(address, payload, signature)
            }
        })
        this.doValidation = super.validate.bind(this)
    }

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
