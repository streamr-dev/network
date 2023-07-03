import { ListeningRpcCommunicator, PeerDescriptor, PeerID } from "@streamr/dht"
import { StreamNodeServer } from "../../src/logic/StreamNodeServer"
import { ContentMessage, LeaveStreamNotice } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { MockTransport } from "../utils/mock/Transport"
import { createStreamMessage } from "../utils/utils"

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

    const content: ContentMessage = {
        body: JSON.stringify({ hello: "WORLD" })
    }
    const message = createStreamMessage(content, 'random-graph', 'publisher')

    let mockBroadcast: jest.Mock
    let mockDuplicateCheck: jest.Mock
    let mockOnLeaveNotice: jest.Mock

    beforeEach(async () => {
        mockDuplicateCheck = jest.fn((_c, _p) => true)
        mockBroadcast = jest.fn((_m, _p) => {})
        mockOnLeaveNotice = jest.fn((_m) => {})
        streamNodeServer = new StreamNodeServer({
            markAndCheckDuplicate: mockDuplicateCheck,
            broadcast: mockBroadcast,
            onLeaveNotice: mockOnLeaveNotice,
            ownPeerDescriptor: peerDescriptor,
            randomGraphId: 'random-graph',
            rpcCommunicator: new ListeningRpcCommunicator('random-graph-node', new MockTransport())
        })
    })
    
    it('Server sendData()', async () => {
        await streamNodeServer.sendData(message, { incomingSourceDescriptor: mockSender } as any)
        expect(mockDuplicateCheck).toHaveBeenCalledTimes(1)
        expect(mockBroadcast).toHaveBeenCalledTimes(1)
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
