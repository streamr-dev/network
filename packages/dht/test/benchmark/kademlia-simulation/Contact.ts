import { PeerID } from '../../../src/helpers/PeerID'
import type { SimulationNode } from './SimulationNode'
export class Contact {	
    private static counter = 0

    public ownId: PeerID
    public vectorClock = 0
    public dhtNode: SimulationNode | undefined

    constructor(ownId: PeerID, dhtNode?: SimulationNode) {
        this.ownId = ownId
        this.vectorClock = Contact.counter++
        this.dhtNode = dhtNode
    }

    get id(): Uint8Array {
        return this.ownId.value
    }

    get peerId(): PeerID {
        return this.ownId
    }
}
