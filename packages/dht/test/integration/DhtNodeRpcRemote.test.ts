import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { createMockDhtRpc, createMockPeerDescriptor, createMockPeers } from '../utils/utils'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PingRequest,
    PingResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { DhtNodeRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'

const SERVICE_ID = 'test'

describe('DhtNodeRpcRemote', () => {

    let rpcRemote: DhtNodeRpcRemote
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()
    const mockDhtRpc = createMockDhtRpc(createMockPeers())

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', mockDhtRpc.getClosestPeers)
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.ping)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new DhtNodeRpcClient(clientRpcCommunicator.getRpcClientTransport()))
        rpcRemote = new DhtNodeRpcRemote(clientPeerDescriptor, serverPeerDescriptor, client, SERVICE_ID)
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
        const neighbors = await rpcRemote.getClosestPeers(clientPeerDescriptor.nodeId)
        expect(neighbors.length).toEqual(createMockPeers().length)
    })

    it('ping error path', async () => {
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.throwPingError)
        const active = await rpcRemote.ping()
        expect(active).toEqual(false)
    })

    it('getClosestPeers error path', async () => {
        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', mockDhtRpc.throwGetClosestPeersError)
        await expect(rpcRemote.getClosestPeers(clientPeerDescriptor.nodeId))
            .rejects.toThrow('Closest peers error')
    })

})
