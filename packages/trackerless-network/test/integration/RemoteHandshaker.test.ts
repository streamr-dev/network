import {
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    ListeningRpcCommunicator,
    NodeType,
    PeerDescriptor,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    HandshakeRpcClient,
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteHandshaker } from '../../src/logic/neighbor-discovery/RemoteHandshaker'

describe('RemoteHandshaker', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let remoteHandshaker: RemoteHandshaker

    const clientNode: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const serverNode: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(() => {
        Simulator.useFakeTimers()
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcMethod(
            StreamPartHandshakeRequest,
            StreamPartHandshakeResponse,
            'handshake',
            async (msg: StreamPartHandshakeRequest, _context: ServerCallContext): Promise<StreamPartHandshakeResponse> => {
                const res: StreamPartHandshakeResponse = {
                    requestId: msg.requestId,
                    accepted: true
                }
                return res
            }
        )

        remoteHandshaker = new RemoteHandshaker(
            clientNode,
            serverNode,
            'test-stream-part',
            toProtoRpcClient(new HandshakeRpcClient(clientRpc.getRpcClientTransport()))
        )
    })

    afterEach(async () => {
        clientRpc.stop()
        mockServerRpc.stop()
        await mockConnectionManager1.stop()
        await mockConnectionManager2.stop()
        simulator.stop()
        Simulator.useFakeTimers(false)
    })

    it('handshake', async () => {
        const result = await remoteHandshaker.handshake([])
        expect(result.accepted).toEqual(true)
    })
})
