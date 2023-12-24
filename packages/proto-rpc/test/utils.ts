/* eslint-disable no-underscore-dangle, class-methods-use-this */

import {
    ClosestPeersRequest, ClosestPeersResponse, PingRequest,
    PingResponse, RouteMessageAck, RouteMessageWrapper
} from './proto/TestProtos'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { NodeType, PeerDescriptor } from './proto/TestProtos'
import { IDhtRpcService } from './proto/TestProtos.server'

export class PingRequestDecorator {
    _parent: PingRequest
    constructor(request: PingRequest) {
        this._parent = request
    }
    public getRequestId(): string {
        return 'decorated:' + this._parent.requestId
    }
}

//export interface HumanReadablePingRequest extends PingRequest, HumanReadablePingRequestDecorator { }

export class MockDhtRpc implements IDhtRpcService {

    static timeoutCounter = 0
    static timeouts: Record<string, any> = {}

    async decoratedPing(request: PingRequestDecorator & PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.getRequestId()
        }
        return response
    }
    
    static respondPingWithTimeout(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        return new Promise((resolve, _reject) => {
            const response: PingResponse = {
                requestId: request.requestId
            }
            MockDhtRpc.timeoutCounter++
            const timeoutId = '' + MockDhtRpc.timeoutCounter
            MockDhtRpc.timeouts[timeoutId] = setTimeout(() => {
                delete MockDhtRpc.timeouts[timeoutId]
                resolve(response)
            }, 2000)
        })
    }
    
    static clearMockTimeouts(): void {
        for (const [k, v] of Object.entries(MockDhtRpc.timeouts)) {
            clearTimeout(v)
            delete MockDhtRpc.timeouts[k]
        }
    }

    async getClosestPeers(_request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            requestId: 'why am i still here'
        }
        return response
    }
    
    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }
    
    async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    }
    
    async throwPingError(_urequest: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        throw new Error()
    }

    async throwGetClosestPeersError(_urequest: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        throw new Error()
    }

    async throwRouteMessageError(_urequest: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        throw new Error()
    }
}

export const generateId = (stringId: string): Uint8Array => {
    return new TextEncoder().encode(stringId)
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
        peerId: generateId('Neighbor4'),
        type: NodeType.NODEJS,
    }
    return [
        n1, n2, n3, n4
    ]
}
