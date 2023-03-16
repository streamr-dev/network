import { RpcCommunicator, toProtoRpcClient } from "@streamr/proto-rpc"
import { RemoteRouter } from "../../src/dht/routing/RemoteRouter"
import { Message, MessageType, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from "../../src/proto/packages/dht/protos/DhtRpc"
import { RoutingServiceClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { RpcMessage } from "../../src/proto/packages/proto-rpc/protos/ProtoRpc"
import { DhtCallContext } from "../../src/rpc-protocol/DhtCallContext"
import { createWrappedClosestPeersRequest, generateId, MockRoutingService } from "../utils"

describe('RemoteRouter', () => {

    let remoteRouter: RemoteRouter
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
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', MockRoutingService.routeMessage)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: DhtCallContext) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new RoutingServiceClient(clientRpcCommunicator.getRpcClientTransport()))
        remoteRouter = new RemoteRouter(clientPeerDescriptor, serverPeerDescriptor, client, serviceId)
    })

    it('routeMessage happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor, serverPeerDescriptor)
        const routed: Message = {
            serviceId: serviceId,
            messageId: 'routed',
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            }
        }
        const routable = await remoteRouter.routeMessage({
            requestId: 'routed',
            message: routed,
            sourcePeer: clientPeerDescriptor,
            destinationPeer: serverPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        })
        expect(routable).toEqual(true)
    })

    it('routeMessage error path', async () => {
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', MockRoutingService.throwRouteMessageError)
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor, serverPeerDescriptor)
        const routed: Message = {
            serviceId: serviceId,
            messageId: 'routed',
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            }
        }
        const routable = await remoteRouter.routeMessage({
            requestId: 'routed',
            message: routed,
            sourcePeer: clientPeerDescriptor,
            destinationPeer: serverPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        })
        expect(routable).toEqual(false)
    })

})
