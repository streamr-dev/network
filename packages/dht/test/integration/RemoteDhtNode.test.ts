import { RemoteDhtNode } from '../../src/dht/RemoteDhtNode'
import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { getMockPeers, MockDhtRpc } from '../utils/utils'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { DhtRpcServiceClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { generateId } from '../utils/utils'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('RemoteDhtNode', () => {

    let remoteDhtNode: RemoteDhtNode
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const serviceId = 'test'
    const clientPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('dhtPeer'),
        type: NodeType.NODEJS
    }
    const serverPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('server'),
        type: NodeType.NODEJS
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.getClosestPeers)
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new DhtRpcServiceClient(clientRpcCommunicator.getRpcClientTransport()))
        remoteDhtNode = new RemoteDhtNode(clientPeerDescriptor, serverPeerDescriptor, client, serviceId)
    })

    afterEach(() => {
        clientRpcCommunicator.stop()
        serverRpcCommunicator.stop()
    })

    it('Ping happy path', async () => {
        const active = await remoteDhtNode.ping()
        expect(active).toEqual(true)
    })

    it('getClosestPeers happy path', async () => {
        const neighbors = await remoteDhtNode.getClosestPeers(clientPeerDescriptor.kademliaId)
        expect(neighbors.length).toEqual(getMockPeers().length)
    })

    it('ping error path', async () => {
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.throwPingError)
        const active = await remoteDhtNode.ping()
        expect(active).toEqual(false)
    })

    it('getClosestPeers error path', async () => {
        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.throwGetClosestPeersError)
        await expect(remoteDhtNode.getClosestPeers(clientPeerDescriptor.kademliaId))
            .rejects.toThrow('Closest peers error')
    })

})
