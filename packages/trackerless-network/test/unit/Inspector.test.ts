import { ListeningRpcCommunicator, PeerDescriptor } from '@streamr/dht'
import { utf8ToBinary } from '@streamr/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { Inspector } from '../../src/logic/inspect/Inspector'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createRandomNodeId, mockConnectionLocker } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

describe('Inspector', () => {
    
    let inspector: Inspector
    const inspectorDescriptor = createMockPeerDescriptor()

    const inspectedDescriptor = createMockPeerDescriptor()

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
            streamPartId: StreamPartIDUtils.parse('stream#0'),
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
