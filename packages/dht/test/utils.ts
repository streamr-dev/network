import { DhtNode } from '../src/dht/DhtNode'
import {
    ClosestPeersRequest, ClosestPeersResponse,
    NodeType,
    PeerDescriptor, PingRequest, PingResponse, RouteMessageAck, RouteMessageWrapper,
    RpcMessage, WebSocketConnectionRequest, WebSocketConnectionResponse
} from '../src/proto/DhtRpc'
import { PeerID } from '../src/helpers/PeerID'
import { IDhtRpcService, IWebSocketConnectorService } from '../src/proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Simulator } from '../src/connection/Simulator'
import { ConnectionManager } from '../src/exports'

export const generateId = (stringId: string): Uint8Array => {
    return PeerID.fromString(stringId).value
}

export const createMockConnectionDhtNode = async (stringId: string, simulator: Simulator, binaryId?: Uint8Array, K?: number): Promise<DhtNode> => {
    let id: PeerID
    if (binaryId) {
        id = PeerID.fromValue(binaryId)
    } else {
        id = PeerID.fromString(stringId)
    }
    const peerDescriptor: PeerDescriptor = {
        peerId: id.value,
        type: NodeType.NODEJS
    }

    const mockConnectionManager = new ConnectionManager({ ownPeerDescriptor: peerDescriptor, simulator: simulator })
    
    const node = new DhtNode({ peerDescriptor: peerDescriptor, transportLayer: mockConnectionManager, 
        nodeName: stringId, numberOfNodesPerKBucket: K })
    await node.start()

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
    _udestinationDescriptor: PeerDescriptor
): RpcMessage => {

    const routedMessage: ClosestPeersRequest = {
        peerDescriptor: sourceDescriptor,
        requestId: '11111'
    }
    const rpcWrapper: RpcMessage = {
        body: ClosestPeersRequest.toBinary(routedMessage),
        header: {
            method: 'closestPeersRequest',
            request: 'request'
        },
        requestId: 'testId'
    }
    return rpcWrapper
}

interface IDhtRpcWithError extends IDhtRpcService {
    throwPingError: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse> 
    respondPingWithTimeout: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse> 
    throwGetClosestPeersError: (request: ClosestPeersRequest, _context: ServerCallContext) => Promise<ClosestPeersResponse>
    throwRouteMessageError: (request: RouteMessageWrapper, _context: ServerCallContext) => Promise<RouteMessageAck>
}

export const MockDhtRpc: IDhtRpcWithError = {
    async getClosestPeers(_request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            requestId: 'why am i still here'
        }
        return response
    },
    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    },
    async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    },
    async forwardMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    },
    async throwPingError(_urequest: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        throw new Error()
    },
    respondPingWithTimeout(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        return new Promise((resolve, _reject) => {
            const response: PingResponse = {
                requestId: request.requestId
            }
            setTimeout(() => resolve(response), 2000)
        })
    },
    async throwGetClosestPeersError(_urequest: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        throw new Error()
    },
    async throwRouteMessageError(_urequest: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        throw new Error()
    }
}

export const MockWebSocketConnectorRpc: IWebSocketConnectorService = {
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

