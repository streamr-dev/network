import { ListeningRpcCommunicator, Simulator, PeerDescriptor, PeerID, SimulatorTransport } from '@streamr/dht'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    ContentMessage,
    StreamHandshakeRequest,
    StreamHandshakeResponse,
    LeaveStreamNotice,
    NeighborUpdate, StreamMessage
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { waitForCondition } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { createStreamMessage } from '../utils'

describe('RemoteRandomGraphNode', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let remoteRandomGraphNode: RemoteRandomGraphNode

    const clientPeer: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: 1
    }
    const serverPeer: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: 1
    }

    let recvCounter: number

    beforeEach(() => {
        recvCounter = 0
        const simulator = new Simulator()
        const mockConnectionManager1 = new SimulatorTransport(serverPeer, simulator)
        const mockConnectionManager2 = new SimulatorTransport(clientPeer, simulator)
        
        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcNotification(
            StreamMessage,
            'sendData',
            async (_msg: StreamMessage, _context: ServerCallContext): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        mockServerRpc.registerRpcMethod(
            StreamHandshakeRequest,
            StreamHandshakeResponse,
            'handshake',
            async (msg: StreamHandshakeRequest, _context: ServerCallContext): Promise<StreamHandshakeResponse> => {
                const res: StreamHandshakeResponse = {
                    requestId: msg.requestId,
                    accepted: true
                }
                return res
            }
        )

        mockServerRpc.registerRpcNotification(
            LeaveStreamNotice,
            'leaveStreamNotice',
            async (_msg: LeaveStreamNotice, _context: ServerCallContext): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        mockServerRpc.registerRpcMethod(
            NeighborUpdate,
            NeighborUpdate,
            'neighborUpdate',
            async (_msg: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> => {
                const peer: PeerDescriptor = {
                    kademliaId: new Uint8Array([4, 2, 4]),
                    type: 0
                }

                const update: NeighborUpdate = {
                    senderId: PeerID.fromValue(peer.kademliaId).toKey(),
                    randomGraphId: 'testStream',
                    neighborDescriptors: [
                        peer
                    ],
                    removeMe: false
                }
                return update
            }
        )
        remoteRandomGraphNode = new RemoteRandomGraphNode(
            serverPeer,
            'test-stream',
            toProtoRpcClient(new NetworkRpcClient(clientRpc.getRpcClientTransport()))
        )
    })

    afterEach(() => {
        clientRpc.stop()
        mockServerRpc.stop()
    })

    it('sendData', async  () => {
        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            'test-stream',
            PeerID.fromValue(clientPeer.kademliaId).toString()
        )

        await remoteRandomGraphNode.sendData(clientPeer, msg)
        await waitForCondition(() => recvCounter === 1)
    })

    it('handshake', async () => {
        const result = await remoteRandomGraphNode.handshake(clientPeer, [], [])
        expect(result.accepted).toEqual(true)
    })

    it('leaveNotice', async () => {
        await remoteRandomGraphNode.leaveStreamNotice(clientPeer)
        await waitForCondition(() => recvCounter === 1)
    })

    it('updateNeighbors', async () => {
        const res = await remoteRandomGraphNode.updateNeighbors(clientPeer, [])
        expect(res.peers.length).toEqual(1)
    })
})
