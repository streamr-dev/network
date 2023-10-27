import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { RouterRpcRemote } from '../../src/dht/routing/RouterRpcRemote'
import { Message, MessageType, NodeType, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RouterRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { createWrappedClosestPeersRequest, generateId, mockRouterRpc } from '../utils/utils'

describe('RemoteRouter', () => {

    let remoteRouter: RouterRpcRemote
    let clientRpcCommunicator: RpcCommunicator
    let serverRpcCommunicator: RpcCommunicator
    const serviceId = 'test'
    const clientPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('client'),
        type: NodeType.NODEJS
    }
    const serverPeerDescriptor: PeerDescriptor = {
        kademliaId: generateId('server'),
        type: NodeType.NODEJS
    }

    beforeEach(() => {
        clientRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator = new RpcCommunicator()
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', mockRouterRpc.routeMessage)
        clientRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            serverRpcCommunicator.handleIncomingMessage(message)
        })
        serverRpcCommunicator.on('outgoingMessage', (message: RpcMessage) => {
            clientRpcCommunicator.handleIncomingMessage(message)
        })
        const client = toProtoRpcClient(new RouterRpcClient(clientRpcCommunicator.getRpcClientTransport()))
        remoteRouter = new RouterRpcRemote(clientPeerDescriptor, serverPeerDescriptor, serviceId, client)
    })

    it('routeMessage happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor)
        const routed: Message = {
            serviceId,
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
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', mockRouterRpc.throwRouteMessageError)
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor)
        const routed: Message = {
            serviceId,
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
