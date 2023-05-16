import { StreamMessage } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { GapHandler, MessageHandler, OnDrain, OnError, OrderedMsgChain } from './OrderedMsgChain'

export default class OrderingUtil {

    private maxGapRequests: number
    private readonly orderedChains: Record<string, OrderedMsgChain>
    private readonly inOrderHandler: MessageHandler
    private readonly gapHandler: GapHandler
    private readonly onDrain: OnDrain
    private readonly onError: OnError
    private readonly gapFillTimeout: number
    private readonly retryResendAfter: number

    constructor(
        inOrderHandler: MessageHandler,
        gapHandler: GapHandler,
        onDrain: OnDrain,
        onError: OnError,
        gapFillTimeout: number,
        retryResendAfter: number,
        maxGapRequests: number
    ) {
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.onDrain = onDrain
        this.onError = onError
        this.gapFillTimeout = gapFillTimeout
        this.retryResendAfter = retryResendAfter
        this.maxGapRequests = maxGapRequests
        this.orderedChains = {}
    }

    add(unorderedStreamMessage: StreamMessage): void {
        const chain = this.getChain(unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId())
        chain.add(unorderedStreamMessage)
    }

    private getChain(publisherId: EthereumAddress, msgChainId: string): OrderedMsgChain {
        const key = publisherId + msgChainId
        if (!this.orderedChains[key]) {
            const chain = new OrderedMsgChain(
                publisherId, msgChainId, this.inOrderHandler, this.gapHandler, this.onDrain, this.onError,
                this.gapFillTimeout, this.retryResendAfter, this.maxGapRequests
            )
            this.orderedChains[key] = chain

        }
        return this.orderedChains[key]
    }

    isEmpty(): boolean {
        return Object.values(this.orderedChains).every((chain) => (
            chain.isEmpty()
        ))
    }

    clearGaps(): void {
        Object.values(this.orderedChains).forEach((chain) => {
            chain.clearGap()
        })
    }

    disable(): void {
        this.maxGapRequests = 0
        Object.values(this.orderedChains).forEach((chain) => {
            chain.disable()
        })
    }
}
