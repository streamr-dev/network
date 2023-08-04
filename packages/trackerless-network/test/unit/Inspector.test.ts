import { ListeningRpcCommunicator, NodeType, PeerDescriptor, PeerID, keyFromPeerDescriptor } from "@streamr/dht"
import { PeerList } from "../../src/logic/PeerList"
import { Inspector } from "../../src/logic/inspect/Inspector"
import { createMockRemotePeer, mockConnectionLocker } from "../utils/utils"
import { MockTransport } from "../utils/mock/Transport"

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

    const otherPeerKey = PeerID.fromString('other').toKey()
    let neighbors: PeerList
    let mockConnect: jest.Mock

    const messageRef = {
        streamId: 'stream',
        messageChainId: 'messageChain0',
        streamPartition: 0,
        sequenceNumber: 0,
        timestamp: 12345,
        publisherId: 'publisher'
    }

    beforeEach(() => {
        mockConnect = jest.fn(() => {})
        neighbors = new PeerList(inspectorPeerId, 10)
        inspector = new Inspector({
            neighbors,
            ownPeerDescriptor: inspectorDescriptor,
            graphId: 'test',
            rpcCommunicator: new ListeningRpcCommunicator('inspector', new MockTransport()),
            connectionLocker: mockConnectionLocker,
            openInspectConnection: async (_peerDescriptor: PeerDescriptor, _lockId: string) => mockConnect()
        })
    })

    afterEach(() => {
        neighbors.clear()
        inspector.stop()
        mockConnect.mockClear()
    })

    it('Opens inspection connection and runs successfully', async () => {
        setTimeout(() => {
            inspector.markMessage(keyFromPeerDescriptor(inspectedDescriptor), messageRef)
            inspector.markMessage(otherPeerKey, messageRef)
        }, 250)
        await inspector.inspect(inspectedDescriptor)
        expect(inspector.isInspected(keyFromPeerDescriptor(inspectedDescriptor))).toBe(false)
        expect(mockConnect).toBeCalledTimes(1)
    })

    it('Negotiated inspection connection even a stream connection if already exists', async () => {
        neighbors.add(createMockRemotePeer(inspectedDescriptor))
        setTimeout(() => {
            inspector.markMessage(keyFromPeerDescriptor(inspectedDescriptor), messageRef)
            inspector.markMessage(otherPeerKey, messageRef)
        }, 250)
        await inspector.inspect(inspectedDescriptor)
        expect(inspector.isInspected(keyFromPeerDescriptor(inspectedDescriptor))).toBe(false)
        expect(mockConnect).toBeCalledTimes(1)
    })
})
