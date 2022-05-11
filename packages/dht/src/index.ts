import { MockConnectionManager } from './connection/MockConnectionManager'
import { DhtNode } from './dht/DhtNode'
import { PeerID } from './PeerID'

const main = async () => {

    const mockDescriptor = {
        peerId: PeerID.fromString('jee').value,
        type: 0
    }

    const mockConnectionLayer = new MockConnectionManager(mockDescriptor)
    
    new DhtNode({peerIdString: 'peer', transportLayer: mockConnectionLayer})
}

main()