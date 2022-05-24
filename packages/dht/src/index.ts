import { MockConnectionManager } from './connection/MockConnectionManager'
import { Simulator } from './connection/Simulator'
import { DhtNode } from './dht/DhtNode'
import { PeerID } from './helpers/PeerID'

const main = async () => {

    const mockDescriptor = {
        peerId: PeerID.fromString('jee').value,
        type: 0
    }
    const simulator = new Simulator()
    const mockConnectionLayer = new MockConnectionManager(mockDescriptor, simulator)
    
    new DhtNode({peerIdString: 'peer', transportLayer: mockConnectionLayer})
}

main()