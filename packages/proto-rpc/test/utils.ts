import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper,
    NodeType,
    PeerDescriptor
} from './proto/TestProtos'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { IDhtRpcService } from './proto/TestProtos.server'

interface IDhtRpcWithError extends IDhtRpcService {
    throwPingError: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    respondPingWithTimeout: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    throwGetClosestPeersError: (request: ClosestPeersRequest, _context: ServerCallContext) => Promise<ClosestPeersResponse>
    throwRouteMessageError: (request: RouteMessageWrapper, _context: ServerCallContext) => Promise<RouteMessageAck>
}

let timeoutCounter = 0
const timeouts: Record<string, any> = {}
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
    async throwPingError(_urequest: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        throw new Error()
    },
    respondPingWithTimeout(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        return new Promise((resolve, _reject) => {
            const response: PingResponse = {
                requestId: request.requestId
            }
            timeoutCounter++
            const timeoutId = '' + timeoutCounter
            timeouts[timeoutId] = setTimeout(() => {
                delete timeouts[timeoutId]
                resolve(response)
            }, 2000)
        })
    },
    async throwGetClosestPeersError(_urequest: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        throw new Error()
    },
    async throwRouteMessageError(_urequest: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        throw new Error()
    }
}

export function clearMockTimeouts(): void {
    for (const [k, v] of Object.entries(timeouts)) {
        clearTimeout(v)
        delete timeouts[k]
    }
}

export const generateId = (stringId: string): Uint8Array => {
    return new TextEncoder().encode(stringId)
}

export const getMockPeers = (): PeerDescriptor[] => {
    const n1: PeerDescriptor = {
        nodeId: generateId('Neighbor1'),
        type: NodeType.NODEJS,
    }
    const n2: PeerDescriptor = {
        nodeId: generateId('Neighbor2'),
        type: NodeType.NODEJS,
    }
    const n3: PeerDescriptor = {
        nodeId: generateId('Neighbor3'),
        type: NodeType.NODEJS,
    }
    const n4: PeerDescriptor = {
        nodeId: generateId('Neighbor4'),
        type: NodeType.NODEJS,
    }
    return [
        n1, n2, n3, n4
    ]
}
