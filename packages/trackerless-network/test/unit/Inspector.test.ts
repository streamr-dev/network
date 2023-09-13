import { ListeningRpcCommunicator, PeerDescriptor } from '@streamr/dht'
import { Inspector } from '../../src/logic/inspect/Inspector'
import { createRandomNodeId, mockConnectionLocker } from '../utils/utils'
import { MockTransport } from '../utils/mock/Transport'
import { hexToBinary, utf8ToBinary } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('Inspector', () => {
    
    let inspector: Inspector
    const inspectorNodeId = createRandomNodeId()
    const inspectorDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(inspectorNodeId),
    }

    const inspectedDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
    }

    const nodeId = createRandomNodeId()
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
            inspector.markMessage(getNodeIdFromPeerDescriptor(inspectedDescriptor), messageRef)
            inspector.markMessage(nodeId, messageRef)
        }, 250)
        await inspector.inspect(inspectedDescriptor)
        expect(inspector.isInspected(getNodeIdFromPeerDescriptor(inspectedDescriptor))).toBe(false)
        expect(mockConnect).toBeCalledTimes(1)
    })

})
