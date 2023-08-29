import { ListeningRpcCommunicator, PeerDescriptor, PeerID } from '@streamr/dht'
import { StreamNodeServer } from '../../src/logic/StreamNodeServer'
import { LeaveStreamNotice } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { MockTransport } from '../utils/mock/Transport'
import { createStreamMessage } from '../utils/utils'
import { utf8ToBinary } from '../../src/logic/utils'
import { StreamPartIDUtils } from '@streamr/protocol'

describe('StreamNodeServer', () => {

    let streamNodeServer: StreamNodeServer
    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('random-graph-node').value,
        type: 0
    }

    const mockSender: PeerDescriptor = {
        kademliaId: PeerID.fromString('mock-sender').value,
        type: 0
    }

    const message = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        StreamPartIDUtils.parse('random-graph#0'),
        utf8ToBinary('publisher')
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
            senderId: 'sender',
            randomGraphId: 'random-graph'
        }
        await streamNodeServer.leaveStreamNotice(leaveNotice, { incomingSourceDescriptor: mockSender } as any)
        expect(mockOnLeaveNotice).toHaveBeenCalledTimes(1)
    })

})
