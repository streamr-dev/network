import type { SimulationNode } from './SimulationNode'
import { NodeType, PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'
import { NodeID, getRawFromNodeId } from '../../../src/identifiers'

export class Contact {
    private static counter = 0

    public ownId: NodeID
    public id: Uint8Array
    public vectorClock = 0
    public dhtNode: SimulationNode | undefined

    constructor(ownId: NodeID, dhtNode?: SimulationNode) {
        this.ownId = ownId
        this.vectorClock = Contact.counter++
        this.dhtNode = dhtNode
        this.id = getRawFromNodeId(ownId)
    }

    getPeerDescriptor(): PeerDescriptor {
        const peerDescriptor: PeerDescriptor = {
            nodeId: getRawFromNodeId(this.ownId),
            type: NodeType.NODEJS
        }
        return peerDescriptor
    }

    getNodeId(): NodeID {
        return this.ownId
    }

}
