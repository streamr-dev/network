import { DhtNode } from '../src/dht/DhtNode'
import { ClientTransport } from '../src/transport/ClientTransport'
import { DummyServerCallContext, ServerTransport } from '../src/transport/ServerTransport'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import { RpcCommunicator } from '../src/transport/RpcCommunicator'
import { DhtRpcClient } from '../src/proto/DhtRpc.client'
import { Event as ITransportEvent } from '../src/transport/ITransport'
import {
    ClosestPeersRequest, ClosestPeersResponse,
    ConnectivityResponseMessage,
    Message,
    NodeType,
    PeerDescriptor, PingRequest, PingResponse, RouteMessageAck, RouteMessageWrapper,
    RpcMessage, WebSocketConnectionRequest, WebSocketConnectionResponse
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/PeerID'
import { ConnectionManager } from '../src/connection/ConnectionManager'
import { IDhtRpc, IWebSocketConnector } from '../src/proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { generateId } from '../src/dht/helpers'

export const createMockConnectionDhtNode = (stringId: string): DhtNode => {
    const id = PeerID.fromString(stringId)
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }
    const clientTransport = new ClientTransport(2000)
    const serverTransport = new ServerTransport()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: mockConnectionLayer,
        dhtTransportClient: clientTransport,
        dhtTransportServer: serverTransport
    })
    const client = new DhtRpcClient(clientTransport)
    return new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

export const createMockConnectionLayer1Node = (stringId: string, layer0Node: DhtNode): DhtNode => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        peerId: id.value,
        type: 0
    }
    const clientTransport = new ClientTransport(5000)
    const serverTransport = new ServerTransport()
    const mockConnectionLayer = new MockConnectionManager()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: mockConnectionLayer,
        dhtTransportClient: clientTransport,
        dhtTransportServer: serverTransport,
        rpcRequestTimeout: 5000
    })
    rpcCommunicator.setSendFn(async (peerDescriptor, message) => {
        await layer0Node.routeMessage({
            message: Message.toBinary(message),
            destinationPeer: peerDescriptor,
            appId: 'Layer1',
            sourcePeer: descriptor
        })
    })
    const client = new DhtRpcClient(clientTransport)
    layer0Node.on(ITransportEvent.DATA, async (peerDescriptor: PeerDescriptor, message: Message) => {
        await rpcCommunicator.onIncomingMessage(peerDescriptor, message)
    })
    return new DhtNode(descriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

export const createWrappedClosestPeersRequest = (
    sourceDescriptor: PeerDescriptor,
    destinationDescriptor: PeerDescriptor
): RpcMessage => {

    const routedMessage: ClosestPeersRequest = {
        peerDescriptor: sourceDescriptor,
        nonce: '11111'
    }
    const rpcWrapper: RpcMessage = {
        body: ClosestPeersRequest.toBinary(routedMessage),
        header: {
            method: 'closestPeersRequest',
            request: 'request'
        },
        requestId: 'testId',
        sourceDescriptor: sourceDescriptor,
        targetDescriptor: destinationDescriptor
    }
    return rpcWrapper
}

export const createPeerDescriptor = (msg: ConnectivityResponseMessage, peerIdString?: string): PeerDescriptor => {
    const ret: PeerDescriptor = {
        peerId: peerIdString ? PeerID.fromString(peerIdString).value : PeerID.fromIp(msg.ip).value,
        type: NodeType.NODEJS,
        websocket: {ip: msg.websocket!.ip, port: msg.websocket!.port}
    }
    return ret
}

export const createLayer0Peer = (peerDescriptor: PeerDescriptor, connectionManager: ConnectionManager): DhtNode => {
    const clientTransport = new ClientTransport()
    const serverTransport = new ServerTransport()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: connectionManager,
        dhtTransportClient: clientTransport,
        dhtTransportServer: serverTransport
    })
    const client = new DhtRpcClient(clientTransport)
    rpcCommunicator.setSendFn((peerDescriptor, message) => {
        connectionManager.send(peerDescriptor, message)
    })
    return new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator)
}

export const createLayer1Peer = (peerDescriptor: PeerDescriptor, layer0Node: DhtNode, streamId: string): DhtNode => {
    const clientTransport = new ClientTransport(10000)
    const serverTransport = new ServerTransport()
    const rpcCommunicator = new RpcCommunicator({
        connectionLayer: layer0Node,
        dhtTransportServer: serverTransport,
        dhtTransportClient: clientTransport,
        appId: streamId,
        rpcRequestTimeout: 10000
    })
    const client = new DhtRpcClient(clientTransport)
    rpcCommunicator.setSendFn((peerDescriptor, message) => {
        layer0Node.send(peerDescriptor, message, streamId)
    })
    return new DhtNode(peerDescriptor, client, clientTransport, serverTransport, rpcCommunicator, streamId)
}

const MockDhtRpc: IDhtRpc = {
    async getClosestPeers(_request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            nonce: 'why am i still here'
        }
        return response
    },
    async ping(request: PingRequest,  _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            nonce: request.nonce
        }
        return response
    },
    async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            nonce: routed.nonce,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    }
}

export const MockRegisterDhtRpc = {
    async getClosestPeers(bytes: Uint8Array): Promise<Uint8Array> {
        const request = ClosestPeersRequest.fromBinary(bytes)
        const response = await MockDhtRpc.getClosestPeers(request, new DummyServerCallContext())
        return ClosestPeersResponse.toBinary(response)
    },
    async ping(bytes: Uint8Array): Promise<Uint8Array> {
        const request = PingRequest.fromBinary(bytes)
        const response = await MockDhtRpc.ping(request, new DummyServerCallContext())
        return PingResponse.toBinary(response)
    },
    async routeMessage(bytes: Uint8Array): Promise<Uint8Array> {
        const message = RouteMessageWrapper.fromBinary(bytes)
        const response = await MockDhtRpc.routeMessage(message, new DummyServerCallContext())
        return RouteMessageAck.toBinary(response)
    }
}

export const MockRegisterWebSocketConnectorRpc = {
    async requestConnection(bytes: Uint8Array): Promise<Uint8Array> {
        const request = WebSocketConnectionRequest.fromBinary(bytes)
        const response = await MockWebSocketConnectorRpc.requestConnection(request, new DummyServerCallContext())
        return WebSocketConnectionResponse.toBinary(response)
    }
}

const MockWebSocketConnectorRpc: IWebSocketConnector = {
    async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        const responseConnection: WebSocketConnectionResponse = {
            target: request.target,
            requester: request.requester,
            accepted: true
        }
        return responseConnection
    }
}

export const getMockPeers = (): PeerDescriptor[] => {
    const n1: PeerDescriptor = {
        peerId: generateId('Neighbor1'),
        type: NodeType.NODEJS,
    }
    const n2: PeerDescriptor = {
        peerId: generateId('Neighbor2'),
        type: NodeType.NODEJS,
    }
    const n3: PeerDescriptor = {
        peerId: generateId('Neighbor3'),
        type: NodeType.NODEJS,
    }
    const n4: PeerDescriptor = {
        peerId: generateId('Neighbor1'),
        type: NodeType.BROWSER,
    }
    return [
        n1, n2, n3, n4
    ]
}