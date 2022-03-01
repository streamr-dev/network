import { EthereumAddress, StreamID, StreamMessage, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { ActiveNodes } from './ActiveNodes'
import { Multimap } from '../utils'

export class FakeStorageNode extends FakeBrubeckNode {

    private readonly streamPartMessages: Multimap<StreamPartID, StreamMessage> = new Multimap()

    constructor(address: EthereumAddress, activeNodes: ActiveNodes, name?: string) {
        super(address, activeNodes, undefined, name)
    }

    async addAssignment(streamId: StreamID): Promise<void> {
        const streamPartId = toStreamPartID(streamId, 0) // TODO all partitions
        const networkNode = await this.getNode()
        if (!networkNode.subsciptions.has(streamPartId)) {
            networkNode.addMessageListener((msg: StreamMessage) => {
                this.storeMessage(msg)
            })
            networkNode.subscribe(streamPartId)
        }
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
            return messages.slice(firstIndex, lastIndex + 1)
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
