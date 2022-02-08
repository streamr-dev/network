import { EthereumAddress, StreamID, StreamMessage, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { ActiveNodes } from './ActiveNodes'

export class FakeStorageNode extends FakeBrubeckNode {

    private streamPartMessages: Map<StreamPartID, StreamMessage[]> = new Map()

    constructor(address: EthereumAddress, activeNodes: ActiveNodes, name?: string) {
        super(address, activeNodes, undefined, name)
    }

    addAssignment(streamId: StreamID) {
        const streamPartId = toStreamPartID(streamId, 0) // TODO all partitions
        this.subscribe(streamPartId, (msg: StreamMessage) => { // TODO do not subscribe if already subscribed
            this.storeMessage(msg)
        })
    }

    private storeMessage(msg: StreamMessage) {
        const streamPartId = msg.getStreamPartID()
        if (this.streamPartMessages.has(streamPartId)) {
            this.streamPartMessages.get(streamPartId)!.push(msg)
        } else {
            this.streamPartMessages.set(streamPartId, [msg])
        }
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
}
