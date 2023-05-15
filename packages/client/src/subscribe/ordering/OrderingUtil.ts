import { StreamMessage } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { GapHandler, MessageHandler, MsgChainEmitter, OrderedMsgChain } from './OrderedMsgChain'

export default class OrderingUtil extends MsgChainEmitter {

    private inOrderHandler: MessageHandler
    private gapHandler: GapHandler
    private gapFillTimeout: number
    private retryResendAfter: number
    private maxGapRequests: number
    private orderedChains: Record<string, OrderedMsgChain>

    constructor(
        inOrderHandler: MessageHandler,
        gapHandler: GapHandler,
        gapFillTimeout: number,
        retryResendAfter: number,
        maxGapRequests: number
    ) {
        super()
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
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
                publisherId, msgChainId, this.inOrderHandler, this.gapHandler,
                this.gapFillTimeout, this.retryResendAfter, this.maxGapRequests
            )
            chain.on('error', (...args) => this.emit('error', ...args))
            chain.on('skip', (...args) => this.emit('skip', ...args))
            chain.on('drain', (...args) => this.emit('drain', ...args))
            this.orderedChains[key] = chain

        }
        return this.orderedChains[key]
    }

    markMessageExplicitly(streamMessage: StreamMessage): void {
        const chain = this.getChain(streamMessage.getPublisherId(), streamMessage.getMsgChainId())
        chain.markMessageExplicitly(streamMessage)
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
