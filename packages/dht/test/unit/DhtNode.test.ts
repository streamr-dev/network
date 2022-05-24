import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/helpers/PeerID'

describe('Route Message With Mock Connections', () => {
    let node: DhtNode
    const simulator = new Simulator()

    beforeEach(async () => {
        const mockDescriptor = {
            peerId: PeerID.fromString('jee').value,
            type: 0
        }
        node = new DhtNode({ peerIdString: 'UnitNode', transportLayer: new MockConnectionManager(mockDescriptor, simulator) })
        await node.start()
    })

    afterEach(async () => {
        await node.stop()
    })

    it('canRoute', async () => {
        // const rpcWrapper = createWrappedClosestPeersRequest(node.getPeerDescriptor(), node.getPeerDescriptor())

    })
})