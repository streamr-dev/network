import type { SimulationNode } from './SimulationNode'
import { NodeType, PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'
import { NodeID } from '../../../src/identifiers'
import { hexToBinary } from '@streamr/utils'

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
        this.id = hexToBinary(ownId)
    }

    getPeerDescriptor(): PeerDescriptor {
        const peerDescriptor: PeerDescriptor = {
            nodeId: hexToBinary(this.ownId),
            type: NodeType.NODEJS
        }
        return peerDescriptor
    }

    getNodeId(): NodeID {
        return this.ownId
    }

}
