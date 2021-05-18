import StreamMessage from '../protocol/message_layer/StreamMessage'
import OrderedMsgChain, { GapHandler, MessageHandler, MsgChainEmitter } from './OrderedMsgChain'

class OrderingUtil extends MsgChainEmitter {
    streamId: string
    streamPartition: number
    inOrderHandler: MessageHandler
    gapHandler: GapHandler
    propagationTimeout?: number
    resendTimeout?: number
    maxGapRequests?: number
    orderedChains: { [key: string]: OrderedMsgChain}

    constructor(
        streamId: string,
        streamPartition: number,
        inOrderHandler: MessageHandler,
        gapHandler: GapHandler,
        propagationTimeout?: number,
        resendTimeout?: number,
        maxGapRequests?: number
    ) {
        super()
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        this.maxGapRequests = maxGapRequests
        this.orderedChains = {}
    }

    add(unorderedStreamMessage: StreamMessage): void {
        const chain = this.getChain(unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId())
        chain.add(unorderedStreamMessage)
    }

    private getChain(publisherId: string, msgChainId: string): OrderedMsgChain {
        const key = publisherId + msgChainId
        if (!this.orderedChains[key]) {
            const chain = new OrderedMsgChain(
                publisherId, msgChainId, this.inOrderHandler, this.gapHandler,
                this.propagationTimeout, this.resendTimeout, this.maxGapRequests
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
}

export default OrderingUtil
