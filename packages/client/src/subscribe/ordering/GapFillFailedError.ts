import { MessageRef } from '@streamr/protocol'
import { MsgChainContext } from './OrderedMsgChain'

export default class GapFillFailedError extends Error {

    from: MessageRef
    to: MessageRef
    context: MsgChainContext

    constructor(from: MessageRef, to: MessageRef, context: MsgChainContext, nbTrials: number) {
        // eslint-disable-next-line max-len
        super(`Failed to fill gap between ${from.serialize()} and ${to.serialize()} for ${context.streamPartId} ${context.publisherId}-${context.msgChainId} after ${nbTrials} trials`)
        this.from = from
        this.to = to
        this.context = context
    }
}
