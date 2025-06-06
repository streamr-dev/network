import { ListeningRpcCommunicator, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { HandshakeRpcRemote } from '../../src/content-delivery-layer/neighbor-discovery/HandshakeRpcRemote'
import {
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import {
    HandshakeRpcClient,
} from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { createMockPeerDescriptor } from '../utils/utils'

describe('HandshakeRpcRemote', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let rpcRemote: HandshakeRpcRemote

    const clientNode = createMockPeerDescriptor()
    const serverNode = createMockPeerDescriptor()

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        await mockConnectionManager1.start()
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)
        await mockConnectionManager2.start()

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcMethod(
            StreamPartHandshakeRequest,
            StreamPartHandshakeResponse,
            'handshake',
            async (msg: StreamPartHandshakeRequest): Promise<StreamPartHandshakeResponse> => {
                const res: StreamPartHandshakeResponse = {
                    requestId: msg.requestId,
                    accepted: true
                }
                return res
            }
        )

        rpcRemote = new HandshakeRpcRemote(
            clientNode,
            serverNode,
            clientRpc,
            HandshakeRpcClient
        )
    })

    afterEach(async () => {
        clientRpc.stop()
        mockServerRpc.stop()
        await mockConnectionManager1.stop()
        await mockConnectionManager2.stop()
        simulator.stop()
    })

    it('handshake', async () => {
        const result = await rpcRemote.handshake(StreamPartIDUtils.parse('test#0'), [])
        expect(result.accepted).toEqual(true)
    })
})
