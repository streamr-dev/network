import {
    EthereumAddress,
    MessageID,
    SigningUtil,
    StreamID,
    StreamMessage,
    StreamPartID,
    toStreamID
} from 'streamr-client-protocol'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { ActiveNodes } from './ActiveNodes'
import { Multimap } from '../Multimap'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { formStorageNodeAssignmentStreamId } from '../../../src/utils/utils'

const PRIVATE_KEY = 'aa7a3b3bb9b4a662e756e978ad8c6464412e7eef1b871f19e5120d4747bce966'

export class FakeStorageNode extends FakeBrubeckNode {

    private readonly streamPartMessages: Multimap<StreamPartID, StreamMessage> = new Multimap()
    private readonly streamRegistry: StreamRegistry

    constructor(address: EthereumAddress, activeNodes: ActiveNodes, name: string, streamRegistry: StreamRegistry) {
        super(address, activeNodes, undefined, name)
        this.streamRegistry = streamRegistry
    }

    async addAssignment(streamId: StreamID): Promise<void> {
        const stream = await this.streamRegistry.getStream(streamId)
        const networkNode = await this.getNode()
        stream.getStreamParts().forEach(async (streamPartId, idx) => {
            if (!networkNode.subscriptions.has(streamPartId)) {
                networkNode.addMessageListener((msg: StreamMessage) => {
                    this.storeMessage(msg)
                })
                networkNode.subscribe(streamPartId)
                const assignmentMessage = new StreamMessage({
                    messageId: new MessageID(
                        toStreamID(formStorageNodeAssignmentStreamId(this.id)),
                        0,
                        Date.now(),
                        idx,
                        this.id,
                        ''
                    ),
                    content: {
                        streamPart: streamPartId,
                    }
                })
                const payload = assignmentMessage.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH)
                assignmentMessage.signature = await SigningUtil.sign(payload, PRIVATE_KEY)
                this.publishToNode(assignmentMessage)
            }
        })
    }

    private storeMessage(msg: StreamMessage): void {
        const streamPartId = msg.getStreamPartID()
        this.streamPartMessages.add(streamPartId, msg)
    }

    async getLast(streamPartId: StreamPartID, count: number): Promise<StreamMessage[]> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            const firstIndex = Math.max(messages.length - count, 0)
            const lastIndex = Math.min(firstIndex + count, messages.length - 1)
            return messages.slice(firstIndex, lastIndex + 1).map((msg: StreamMessage) => {
                // return a clone as client mutates message when it decrypts messages
                const serialized = msg.serialize()
                return StreamMessage.deserialize(serialized)
            })
            // eslint-disable-next-line no-else-return
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
            return []
        }
    }

    async getRange(streamPartId: StreamPartID, opts: {
        fromTimestamp: number,
        fromSequenceNumber: number,
        toTimestamp: number,
        toSequenceNumber: number,
        publisherId: string,
        msgChainId: string
    }): Promise<StreamMessage[]> {
        const messages = this.streamPartMessages.get(streamPartId)
        if (messages !== undefined) {
            return messages.filter((msg) => {
                return (msg.getPublisherId() === opts.publisherId)
                    && (msg.getMsgChainId() === opts.msgChainId)
                    && (
                        ((msg.getTimestamp() > opts.fromTimestamp) && (msg.getTimestamp() < opts.toTimestamp))
                        || ((msg.getTimestamp() === opts.fromTimestamp) && (msg.getSequenceNumber() >= opts.fromSequenceNumber))
                        || ((msg.getTimestamp() === opts.toTimestamp) && (msg.getSequenceNumber() <= opts.toSequenceNumber))
                    )
            })
            // eslint-disable-next-line no-else-return
        } else {
            // TODO throw an error if this storage node doesn't isn't configured to store the stream?
            return []
        }
    }
}
