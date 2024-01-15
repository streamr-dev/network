import type { SimulationNode } from './SimulationNode'
import { NodeType, PeerDescriptor } from '../../../src/proto/packages/dht/protos/DhtRpc'
import { DhtAddress, DhtAddressRaw, getRawFromDhtAddress } from '../../../src/identifiers'

export class Contact {
    private static counter = 0

    public ownId: DhtAddress
    public id: DhtAddressRaw
    public vectorClock = 0
    public dhtNode: SimulationNode | undefined

    constructor(ownId: DhtAddress, dhtNode?: SimulationNode) {
        this.ownId = ownId
        this.vectorClock = Contact.counter++
        this.dhtNode = dhtNode
        this.id = getRawFromDhtAddress(ownId)
    }

    getPeerDescriptor(): PeerDescriptor {
        const peerDescriptor: PeerDescriptor = {
            nodeId: getRawFromDhtAddress(this.ownId),
            details: {
                type: NodeType.NODEJS
            }
        }
        return peerDescriptor
    }

    getNodeId(): DhtAddress {
        return this.ownId
    }

}
