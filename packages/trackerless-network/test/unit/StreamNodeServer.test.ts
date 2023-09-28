import { ListeningRpcCommunicator } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { StreamNodeServer } from '../../src/logic/StreamNodeServer'
import { LeaveStreamNotice } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor, createRandomNodeId, createStreamMessage } from '../utils/utils'

describe('StreamNodeServer', () => {

    let streamNodeServer: StreamNodeServer
    const peerDescriptor = createMockPeerDescriptor()

    const mockSender = createMockPeerDescriptor()

    const message = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        StreamPartIDUtils.parse('random-graph#0'),
        randomEthereumAddress()
    )

    let mockBroadcast: jest.Mock
    let mockDuplicateCheck: jest.Mock
    let mockOnLeaveNotice: jest.Mock
    let mockMarkForInspection: jest.Mock

    beforeEach(async () => {
        mockDuplicateCheck = jest.fn((_c, _p) => true)
        mockBroadcast = jest.fn((_m, _p) => {})
        mockOnLeaveNotice = jest.fn((_m) => {})
        mockMarkForInspection = jest.fn((_m) => {})

        streamNodeServer = new StreamNodeServer({
            markAndCheckDuplicate: mockDuplicateCheck,
            broadcast: mockBroadcast,
            onLeaveNotice: mockOnLeaveNotice,
            markForInspection: mockMarkForInspection,
            ownPeerDescriptor: peerDescriptor,
            randomGraphId: 'random-graph',
            rpcCommunicator: new ListeningRpcCommunicator('random-graph-node', new MockTransport())
        })
    })
    
    it('Server sendData()', async () => {
        await streamNodeServer.sendData(message, { incomingSourceDescriptor: mockSender } as any)
        expect(mockDuplicateCheck).toHaveBeenCalledTimes(1)
        expect(mockBroadcast).toHaveBeenCalledTimes(1)
        expect(mockMarkForInspection).toHaveBeenCalledTimes(1)
    })

    it('Server leaveStreamNotice()', async () => {
        const leaveNotice: LeaveStreamNotice = {
            senderId: hexToBinary(createRandomNodeId()),
            randomGraphId: 'random-graph'
        }
        await streamNodeServer.leaveStreamNotice(leaveNotice, { incomingSourceDescriptor: mockSender } as any)
        expect(mockOnLeaveNotice).toHaveBeenCalledTimes(1)
    })

})
