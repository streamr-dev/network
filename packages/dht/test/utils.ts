import { DhtNode } from '../src/dht/DhtNode'
import { MockConnectionManager } from '../src/connection/MockConnectionManager'
import {
    ClosestPeersRequest, ClosestPeersResponse,
    ConnectivityResponseMessage,
    NodeType,
    PeerDescriptor, PingRequest, PingResponse, RouteMessageAck, RouteMessageWrapper,
    RpcMessage, WebSocketConnectionRequest, WebSocketConnectionResponse
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/helpers/PeerID'
import { IDhtRpc, IWebSocketConnector } from '../src/proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { generateId } from '../src/helpers/common'
import { Simulator } from '../src/connection/Simulator'

export const createMockConnectionDhtNode = async (stringId: string, simulator: Simulator, binaryId?: Uint8Array, K?: number): Promise<DhtNode> => {
    let id: PeerID
    if (binaryId) {
        id = PeerID.fromValue(binaryId)
    }
    else {
        id = PeerID.fromString(stringId)
    }
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }

    const mockConnectionLayer = new MockConnectionManager(peerDescriptor, simulator)

    const node = new DhtNode({ peerDescriptor: peerDescriptor, transportLayer: mockConnectionLayer, 
        nodeName: stringId, numberOfNodesPerKBucket: K })
    await node.start()
    simulator.addNode(node)
    return node
}

export const createMockConnectionLayer1Node = async (stringId: string, layer0Node: DhtNode): Promise<DhtNode> => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        peerId: id.value,
        type: 0
    }

    const node = new DhtNode({ peerDescriptor: descriptor, transportLayer: layer0Node })
    await node.start()
    return node
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
        websocket: { ip: msg.websocket!.ip, port: msg.websocket!.port }
    }
    return ret
}

export const MockDhtRpc: IDhtRpc = {
    async getClosestPeers(_request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            nonce: 'why am i still here'
        }
        return response
    },
    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
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

export const MockWebSocketConnectorRpc: IWebSocketConnector = {
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
