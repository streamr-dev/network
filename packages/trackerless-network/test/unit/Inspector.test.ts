import { ListeningRpcCommunicator, randomDhtAddress, toNodeId } from '@streamr/dht'
import { StreamPartIDUtils, utf8ToBinary } from '@streamr/utils'
import { Inspector } from '../../src/logic/inspect/Inspector'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor, mockConnectionLocker } from '../utils/utils'

describe('Inspector', () => {
    let inspector: Inspector
    const inspectorDescriptor = createMockPeerDescriptor()

    const inspectedDescriptor = createMockPeerDescriptor()

    const nodeId = randomDhtAddress()
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
            localPeerDescriptor: inspectorDescriptor,
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            rpcCommunicator: new ListeningRpcCommunicator('inspector', new MockTransport()),
            connectionLocker: mockConnectionLocker,
            openInspectConnection: async () => mockConnect()
        })
    })

    afterEach(() => {
        inspector.stop()
    })

    it('Opens inspection connection and runs successfully', async () => {
        setTimeout(() => {
            inspector.markMessage(toNodeId(inspectedDescriptor), messageRef)
            inspector.markMessage(nodeId, messageRef)
        }, 250)
        await inspector.inspect(inspectedDescriptor)
        expect(inspector.isInspected(toNodeId(inspectedDescriptor))).toBe(false)
        expect(mockConnect).toHaveBeenCalledTimes(1)
    })
})
