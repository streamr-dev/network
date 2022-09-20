import { PeerID } from '../../../src/helpers/PeerID'
import type { SimulationNode } from './SimulationNode'
import { NodeType, PeerDescriptor } from '../../../src/proto/DhtRpc'

export class Contact {
    private static counter = 0

    public peerId: PeerID
    public vectorClock = 0
    public dhtNode: SimulationNode | undefined

    constructor(ownId: PeerID, dhtNode?: SimulationNode) {
        this.peerId = ownId
        this.vectorClock = Contact.counter++
        this.dhtNode = dhtNode
    }

    get id(): Uint8Array {
        return this.peerId.value
    }

    getPeerDescriptor(): PeerDescriptor {
        const peerDescriptor: PeerDescriptor = {
            peerId: this.peerId.value,
            type: NodeType.NODEJS
        }
        return peerDescriptor
    }


}
