import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { createMockDhtRpc, createMockPeerDescriptor, createMockPeers } from '../utils/utils'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PingRequest,
    PingResponse
} from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'
import { toNodeId } from '../../src/identifiers'

const SERVICE_ID = 'test'

describe('DhtNodeRpcRemote', () => {
    let rpcRemote: DhtNodeRpcRemote
    let clientRpcCommunicator: RpcCommunicator<DhtCallContext>
    let serverRpcCommunicator: RpcCommunicator<DhtCallContext>
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()
    const mockDhtRpc = createMockDhtRpc(createMockPeers())

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            mockDhtRpc.getClosestPeers
        )
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.ping)
        clientRpcCommunicator.setOutgoingMessageListener(async (message: RpcMessage) => {
            serverRpcCommunicator.handleIncomingMessage(message, new DhtCallContext())
        })
        serverRpcCommunicator.setOutgoingMessageListener(async (message: RpcMessage) => {
            clientRpcCommunicator.handleIncomingMessage(message, new DhtCallContext())
        })
        rpcRemote = new DhtNodeRpcRemote(clientPeerDescriptor, serverPeerDescriptor, SERVICE_ID, clientRpcCommunicator)
    })

    afterEach(() => {
        clientRpcCommunicator.stop()
        serverRpcCommunicator.stop()
    })

    it('Ping happy path', async () => {
        const active = await rpcRemote.ping()
        expect(active).toEqual(true)
    })

    it('getClosestPeers happy path', async () => {
        const neighbors = await rpcRemote.getClosestPeers(toNodeId(clientPeerDescriptor))
        expect(neighbors.length).toEqual(createMockPeers().length)
    })

    it('ping error path', async () => {
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.throwPingError)
        const active = await rpcRemote.ping()
        expect(active).toEqual(false)
    })

    it('getClosestPeers error path', async () => {
        serverRpcCommunicator.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            mockDhtRpc.throwGetClosestPeersError
        )
        await expect(rpcRemote.getClosestPeers(toNodeId(clientPeerDescriptor))).rejects.toThrow('Closest peers error')
    })
})
