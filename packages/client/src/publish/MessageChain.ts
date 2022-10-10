import {
    MessageRef
} from 'streamr-client-protocol'
import { randomString } from '@streamr/utils'

export const createRandomMsgChainId = (): string => randomString(20)

/**
 * Generate the next message MessageID for a message chain.
 * Messages with same timestamp get incremented sequence numbers.
 */
export const createMessageRef = (timestamp: number, prevMsgRef?: MessageRef): MessageRef => {
    // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
    // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
    // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
    // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
    // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
    // Possible we should keep a global sequence number
    const isSameTimestamp = (prevMsgRef !== undefined) && (prevMsgRef.timestamp === timestamp)
    const nextSequenceNumber = isSameTimestamp ? prevMsgRef!.sequenceNumber + 1 : 0
    const createdMessageRef = new MessageRef(timestamp, nextSequenceNumber)
    // sequence breaking issue above can be "fixed" if caller of this function checks if 
    // timestamp < previous timestamp, but then this message will silently disappear
    return createdMessageRef
}
