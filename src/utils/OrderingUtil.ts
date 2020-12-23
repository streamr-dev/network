import StreamMessage from '../protocol/message_layer/StreamMessage'
import OrderedMsgChain, { GapHandler, InOrderHandler } from './OrderedMsgChain'

export default class OrderingUtil {

    streamId: string
    streamPartition: number
    inOrderHandler: InOrderHandler
    gapHandler: GapHandler
    propagationTimeout: number
    resendTimeout: number
    orderedChains: { [key: string]: OrderedMsgChain}

    constructor(
        streamId: string, 
        streamPartition: number, 
        inOrderHandler: InOrderHandler, 
        gapHandler: GapHandler, 
        propagationTimeout: number, 
        resendTimeout: number
    ) {
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.inOrderHandler = inOrderHandler
        this.gapHandler = gapHandler
        this.propagationTimeout = propagationTimeout
        this.resendTimeout = resendTimeout
        this.orderedChains = {}
    }

    add(unorderedStreamMessage: StreamMessage) {
        const chain = this.getChain(unorderedStreamMessage.getPublisherId(), unorderedStreamMessage.getMsgChainId())
        chain.add(unorderedStreamMessage)
    }

    private getChain(publisherId: string, msgChainId: string) {
        const key = publisherId + msgChainId
        if (!this.orderedChains[key]) {
            this.orderedChains[key] = new OrderedMsgChain(
                publisherId, msgChainId, this.inOrderHandler, this.gapHandler,
                this.propagationTimeout, this.resendTimeout,
            )
        }
        return this.orderedChains[key]
    }

    markMessageExplicitly(streamMessage: StreamMessage) {
        const chain = this.getChain(streamMessage.getPublisherId(), streamMessage.getMsgChainId())
        chain.markMessageExplicitly(streamMessage)
    }

    clearGaps() {
        Object.keys(this.orderedChains).forEach((key) => {
            this.orderedChains[key].clearGap()
        })
    }
}
