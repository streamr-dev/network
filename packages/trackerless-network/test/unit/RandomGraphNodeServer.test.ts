import { ListeningRpcCommunicator, PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from "@streamr/dht"
import { PeerList } from "../../src/logic/PeerList"
import { RandomGraphNodeServer } from "../../src/logic/RandomGraphNodeServer"
import { ContentMessage, LeaveStreamNotice } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"
import { mockLayer1 } from "../utils/mock/MockLayer1"
import { MockNeighborFinder } from "../utils/mock/MockNeighborFinder"
import { MockTransport } from "../utils/mock/Transport"
import { createStreamMessage, mockConnectionLocker } from "../utils/utils"

describe('RandomGraphNodeServer', () => {

    let randomGraphNodeServer: RandomGraphNodeServer
    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('random-graph-node').value,
        type: 0
    }

    const content: ContentMessage = {
        body: JSON.stringify({ hello: "WORLD" })
    }
    const message = createStreamMessage(content, 'random-graph', 'publisher')

    let targetNeighbors: PeerList
    let nearbyContactPool: PeerList
    let randomContactPool: PeerList

    let mockBroadcast: jest.Mock
    let mockDuplicateCheck: jest.Mock

    beforeEach(async () => {
        const peerId = peerIdFromPeerDescriptor(peerDescriptor)

        targetNeighbors = new PeerList(peerId, 10)
        randomContactPool = new PeerList(peerId, 10)
        nearbyContactPool = new PeerList(peerId, 10)

        mockDuplicateCheck = jest.fn((_c, _p) => true)
        mockBroadcast = jest.fn((_m, _p) => {})
        randomGraphNodeServer = new RandomGraphNodeServer({
            markAndCheckDuplicate: mockDuplicateCheck,
            broadcast: mockBroadcast,
            targetNeighbors,
            randomContactPool,
            nearbyContactPool,
            ownPeerDescriptor: peerDescriptor,
            layer1: mockLayer1 as any,
            connectionLocker: mockConnectionLocker,
            neighborFinder: new MockNeighborFinder(),
            randomGraphId: 'random-graph',
            rpcCommunicator: new ListeningRpcCommunicator('random-graph-node', new MockTransport())
        })
    })
    
    it('Server sendData()', async () => {
        await randomGraphNodeServer.sendData(message, {} as any)
        expect(mockDuplicateCheck).toHaveBeenCalledTimes(1)
        expect(mockBroadcast).toHaveBeenCalledTimes(1)
    })

    it('Server leaveStreamNotice()', async () => {
        const leaveNotice: LeaveStreamNotice = {
            senderId: 'sender',
            randomGraphId: 'random-graph'
        }
        await randomGraphNodeServer.leaveStreamNotice(leaveNotice, {} as any)
    })

})
