import { RpcCommunicator } from '@streamr/proto-rpc'
import { RouterRpcRemote } from '../../src/dht/routing/RouterRpcRemote'
import { Message, MessageType, RouteMessageAck, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RouterRpcClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { createMockPeerDescriptor, createWrappedClosestPeersRequest, mockRouterRpc } from '../utils/utils'
import { DhtCallContext } from '../../src/rpc-protocol/DhtCallContext'

const SERVICE_ID = 'test'

describe('RemoteRouter', () => {

    let remoteRouter: RouterRpcRemote
    let clientRpcCommunicator: RpcCommunicator<DhtCallContext>
    let serverRpcCommunicator: RpcCommunicator<DhtCallContext>
    const clientPeerDescriptor = createMockPeerDescriptor()
    const serverPeerDescriptor = createMockPeerDescriptor()

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
        remoteRouter = new RouterRpcRemote(clientPeerDescriptor, serverPeerDescriptor, clientRpcCommunicator, RouterRpcClient)
    })

    it('routeMessage happy path', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor)
        const routed: Message = {
            serviceId: SERVICE_ID,
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
            target: serverPeerDescriptor.nodeId,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        })
        expect(routable).toEqual(true)
    })

    it('routeMessage error path', async () => {
        serverRpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', mockRouterRpc.throwRouteMessageError)
        const rpcWrapper = createWrappedClosestPeersRequest(clientPeerDescriptor)
        const routed: Message = {
            serviceId: SERVICE_ID,
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
            target: serverPeerDescriptor.nodeId,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        })
        expect(routable).toEqual(false)
    })

})
