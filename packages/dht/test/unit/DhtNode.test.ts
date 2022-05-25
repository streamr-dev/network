import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { DhtNode } from '../../src/dht/DhtNode'
import { PeerID } from '../../src/helpers/PeerID'
import { Err } from '../../src/helpers/errors'

describe('DhtNode', () => {
    let node: DhtNode
    const simulator = new Simulator()
    const mockDescriptor = {
        peerId: PeerID.fromString('UnitNode').value,
        type: 0
    }

    beforeEach(async () => {
        node = new DhtNode({ peerIdString: 'UnitNode', transportLayer: new MockConnectionManager(mockDescriptor, simulator) })
        await node.start()
    })

    afterEach(async () => {
        await node.stop()
    })

    it('Cannot be stopped before starting', async () => {
        const notStarted = new DhtNode({ peerIdString: 'UnitNode', transportLayer: new MockConnectionManager(mockDescriptor, simulator) })
        await expect(notStarted.stop())
            .rejects
            .toEqual(new Err.CouldNotStop('Cannot not stop() before start()'))
    })

    it('DhtNode starts', async () => {
        // const rpcWrapper = createWrappedClosestPeersRequest(node.getPeerDescriptor(), node.getPeerDescriptor())
    })
})