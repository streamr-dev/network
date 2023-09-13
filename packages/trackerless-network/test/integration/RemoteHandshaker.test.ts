import {
    StreamHandshakeRequest,
    StreamHandshakeResponse
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import {
    ListeningRpcCommunicator,
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
        kademliaId: new Uint8Array([1, 1, 1])
    }
    const serverNode: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2])
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

        remoteHandshaker = new RemoteHandshaker(
            serverNode,
            'test-stream',
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
        const result = await remoteHandshaker.handshake(clientNode, [])
        expect(result.accepted).toEqual(true)
    })
})
