import { PeerID } from '../../../src/helpers/PeerID'
import type { SimulationNode } from './SimulationNode'
import { NodeType, PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class Contact {
    private static counter = 0

    public peerId: PeerID
    public id: Uint8Array
    public vectorClock = 0
    public dhtNode: SimulationNode | undefined

    constructor(ownId: PeerID, dhtNode?: SimulationNode) {
        this.peerId = ownId
        this.vectorClock = Contact.counter++
        this.dhtNode = dhtNode
        this.id = ownId.value
    }

    getPeerDescriptor(): PeerDescriptor {
        const peerDescriptor: PeerDescriptor = {
            kademliaId: this.peerId.value,
            type: NodeType.NODEJS
        }
        return peerDescriptor
    }

    getPeerId(): PeerID {
        return this.peerId
    }

}
