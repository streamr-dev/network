import { RoutingRpcCommunicator, Simulator, PeerDescriptor, PeerID, Message, SimulatorTransport } from '@streamr/dht'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    DataMessage,
    HandshakeRequest,
    HandshakeResponse,
    LeaveNotice,
    MessageRef,
    NeighborUpdate
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { waitForCondition } from 'streamr-test-utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'

describe('RemoteRandomGraphNode', () => {
    let mockServerRpc: RoutingRpcCommunicator
    let clientRpc: RoutingRpcCommunicator
    let remoteRandomGraphNode: RemoteRandomGraphNode

    const clientPeer: PeerDescriptor = {
        peerId: new Uint8Array([1, 1, 1]),
        type: 1
    }
    const serverPeer: PeerDescriptor = {
        peerId: new Uint8Array([2, 2, 2]),
        type: 1
    }

    let recvCounter: number

    beforeEach(() => {
        recvCounter = 0
        const simulator = new Simulator()
        const mockConnectionManager1 = new SimulatorTransport(serverPeer, simulator)
        const mockConnectionManager2 = new SimulatorTransport(clientPeer, simulator)
        
        mockServerRpc = new RoutingRpcCommunicator('test', mockConnectionManager1.send)
        clientRpc = new RoutingRpcCommunicator('test', mockConnectionManager2.send)

        mockConnectionManager1.on('message', (msg: Message) => {
            mockServerRpc.handleMessageFromPeer(msg)
        })

        mockConnectionManager2.on('message', (msg: Message) => {
            clientRpc.handleMessageFromPeer(msg)
        })

        mockServerRpc.registerRpcNotification(
            DataMessage,
            'sendData',
            async (_msg: DataMessage, _context: ServerCallContext): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        mockServerRpc.registerRpcMethod(
            HandshakeRequest,
            HandshakeResponse,
            'handshake',
            async (msg: HandshakeRequest, _context: ServerCallContext): Promise<HandshakeResponse> => {
                const res: HandshakeResponse = {
                    requestId: msg.requestId,
                    accepted: true
                }
                return res
            }
        )

        mockServerRpc.registerRpcNotification(
            LeaveNotice,
            'leaveNotice',
            async (_msg: LeaveNotice, _context: ServerCallContext): Promise<Empty> => {
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
                    peerId: new Uint8Array([4, 2, 4]),
                    type: 0
                }

                const update: NeighborUpdate = {
                    senderId: PeerID.fromValue(peer.peerId).toKey(),
                    randomGraphId: 'testStream',
                    neighborDescriptors: [
                        peer
                    ]
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
        const messageRef: MessageRef = {
            sequenceNumber: 0,
            timestamp: BigInt(0)
        }
        const dataMessage: DataMessage = {
            content: JSON.stringify({ hello: 'WORLD' }),
            senderId: PeerID.fromValue(clientPeer.peerId).toString(),
            streamPartId: 'test-stream',
            messageRef
        }
        await remoteRandomGraphNode.sendData(clientPeer, dataMessage)
        await waitForCondition(() => recvCounter === 1)
    })

    it('handshake', async () => {
        const result = await remoteRandomGraphNode.handshake(clientPeer, [], [])
        expect(result.accepted).toEqual(true)
    })

    it('leaveNotice', async () => {
        await remoteRandomGraphNode.leaveNotice(clientPeer)
        await waitForCondition(() => recvCounter === 1)
    })

    it('updateNeighbors', async () => {
        const res = await remoteRandomGraphNode.updateNeighbors(clientPeer, [])
        expect(res.length).toEqual(1)
    })
})
