import { ListeningRpcCommunicator, NodeType, PeerDescriptor, PeerID, keyFromPeerDescriptor } from '@streamr/dht'
import { Inspector } from '../../src/logic/inspect/Inspector'
import { mockConnectionLocker } from '../utils/utils'
import { MockTransport } from '../utils/mock/Transport'
import { utf8ToBinary } from '../../src/logic/utils'
import { NodeID } from '../../src/identifiers'

describe('Inspector', () => {
    
    let inspector: Inspector
    const inspectorPeerId = PeerID.fromString('inspector')
    const inspectorDescriptor: PeerDescriptor = {
        kademliaId: inspectorPeerId.value,
        type: NodeType.NODEJS
    }

    const inspectedDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('inspected').value,
        type: NodeType.NODEJS
    }

    const otherPeerKey = PeerID.fromString('other').toKey() as unknown as NodeID
    let mockConnect: jest.Mock

    const messageRef = {
        streamId: 'stream',
        messageChainId: 'messageChain0',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId: utf8ToBinary('publisher')
    }

    beforeEach(() => {
        mockConnect = jest.fn(() => {})
        inspector = new Inspector({
            ownPeerDescriptor: inspectorDescriptor,
            graphId: 'test',
            rpcCommunicator: new ListeningRpcCommunicator('inspector', new MockTransport()),
            connectionLocker: mockConnectionLocker,
            openInspectConnection: async (_peerDescriptor: PeerDescriptor, _lockId: string) => mockConnect()
        })
    })

    afterEach(() => {
        inspector.stop()
    })

    it('Opens inspection connection and runs successfully', async () => {
        setTimeout(() => {
            inspector.markMessage(keyFromPeerDescriptor(inspectedDescriptor) as unknown as NodeID, messageRef)
            inspector.markMessage(otherPeerKey, messageRef)
        }, 250)
        await inspector.inspect(inspectedDescriptor)
        expect(inspector.isInspected(keyFromPeerDescriptor(inspectedDescriptor) as unknown as NodeID)).toBe(false)
        expect(mockConnect).toBeCalledTimes(1)
    })

})
