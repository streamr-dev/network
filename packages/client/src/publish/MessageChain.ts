/**
 * MessageChains
 */
import {
    MessageRef
} from 'streamr-client-protocol'
import { randomString } from '@streamr/utils'

export const createRandomMsgChainId = (): string => randomString(20)

/**
 * Manage sequenceNumber & msgChainId for StreamMessages
 */
export class MessageChain {
    private prevMsgRef?: MessageRef

    /**
     * Generate the next message MessageID + previous MessageRef for this message chain.
     * Messages with same timestamp get incremented sequence numbers.
     */
    add(timestamp: number): [MessageRef, MessageRef | undefined] {
        // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
        // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
        // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
        // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
        // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
        // Possible we should keep a global sequence number
        const isSameTimestamp = (this.prevMsgRef !== undefined) && (this.prevMsgRef.timestamp === timestamp)
        const isBackdated = (this.prevMsgRef !== undefined) && (this.prevMsgRef.timestamp > timestamp)
        // increment if timestamp the same, otherwise 0
        const nextSequenceNumber = isSameTimestamp ? this.prevMsgRef!.sequenceNumber + 1 : 0
        const createdMessageRef = new MessageRef(timestamp, nextSequenceNumber)
        // update latest timestamp + sequence for this streamId+partition
        // (see note above about clobbering sequencing)
        // don't update latest if timestamp < previous timestamp
        // this "fixes" the sequence breaking issue above, but this message will silently disappear
        const currentPrevMsgRef = this.prevMsgRef
        if (!isBackdated) {
            this.prevMsgRef = new MessageRef(timestamp, nextSequenceNumber)
        }
        return [createdMessageRef, currentPrevMsgRef]
    }
}
