import { DhtPeer } from '../../src/dht/DhtPeer'
import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { createWrappedClosestPeersRequest, getMockPeers, MockDhtRpc } from '../utils'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    Message,
    MessageType,
    PeerDescriptor, PingRequest, PingResponse, RouteMessageAck, RouteMessageWrapper,
    RpcMessage
} from '../../src/proto/DhtRpc'
import { DhtRpcServiceClient } from '../../src/proto/DhtRpc.client'
import { generateId } from '../utils'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

describe('DhtPeer', () => {
    let dhtPeer: DhtPeer
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const serviceId = 'test'

    const clientPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('dhtPeer'),
        type: 0
    }
    const serverPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('server'),
        type: 0
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()

        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.getClosestPeers)
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', MockDhtRpc.routeMessage)

        clientRpcCommunicator.on('outgoingMessage', (message: Uint8Array, _requestId: string, _ucallContext?: DhtCallContext) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })

        serverRpcCommunicator.on('outgoingMessage', (message: Uint8Array, _requestId: string, _ucallContext?: DhtCallContext) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })

        const client = toProtoRpcClient(new DhtRpcServiceClient(clientRpcCommunicator.getRpcClientTransport()))
        dhtPeer = new DhtPeer(clientPeerDescriptor, serverPeerDescriptor, client, serviceId)
    })

    afterEach(() => {
        clientRpcCommunicator.stop()
        serverRpcCommunicator.stop()
    })

    it('Ping happy path', async () => {
        const active = await dhtPeer.ping()
        expect(active).toEqual(true)
    })

    it('getClosestPeers happy path', async () => {
        const neighbors = await dhtPeer.getClosestPeers(clientPeerDescriptor.kademliaId)
        expect(neighbors.length).toEqual(getMockPeers().length)
    })

    it('routeMessage happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor, serverPeerDescriptor)
        const routed: Message = {
            serviceId: serviceId,
            messageId: 'routed',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        const routable = await dhtPeer.routeMessage({
            requestId: 'routed',
            message: Message.toBinary(routed),
            sourcePeer: clientPeerDescriptor,
            destinationPeer: serverPeerDescriptor,
            reachableThrough: []
        })
        expect(routable).toEqual(true)
    })

    it('ping error path', async () => {
        serverRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.throwPingError)
        const active = await dhtPeer.ping()
        expect(active).toEqual(false)
    })

    it('getClosestPeers error path', async () => {
        serverRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers', MockDhtRpc.throwGetClosestPeersError)
        await expect(dhtPeer.getClosestPeers(clientPeerDescriptor.kademliaId))
            .rejects.toThrow('Closest peers error')
    })

    it('routeMessage error path', async () => {
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', MockDhtRpc.throwRouteMessageError)
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor, serverPeerDescriptor)
        const routed: Message = {
            serviceId: serviceId,
            messageId: 'routed',
            messageType: MessageType.RPC,
            body: RpcMessage.toBinary(rpcWrapper)
        }
        const routable = await dhtPeer.routeMessage({
            requestId: 'routed',
            message: Message.toBinary(routed),
            sourcePeer: clientPeerDescriptor,
            destinationPeer: serverPeerDescriptor,
            reachableThrough: []
        })
        expect(routable).toEqual(false)
    })

})
