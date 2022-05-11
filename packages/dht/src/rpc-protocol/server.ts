import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PeerDescriptor,
    NodeType,
    PingRequest,
    PingResponse,
    RouteMessageWrapper,
    RouteMessageAck
} from '../proto/DhtRpc'
import { IDhtRpc } from '../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DummyServerCallContext } from '../transport/DhtTransportServer'
import { nodeFormatPeerDescriptor, generateId } from '../dht/helpers'
import { DhtPeer } from '../dht/DhtPeer'
import { TODO } from '../types'

export const createRpcMethods = (getClosestPeersFn: TODO, routeHandler: TODO, canRoute: TODO): any => {
    const DhtRpc: IDhtRpc = {
        async getClosestPeers(request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
            const peerDescriptor = nodeFormatPeerDescriptor(request.peerDescriptor!)
            const closestPeers = getClosestPeersFn(peerDescriptor)
            const peerDescriptors = closestPeers.map((dhtPeer: DhtPeer) => dhtPeer.getPeerDescriptor())
            const response = {
                peers: peerDescriptors,
                nonce: 'aaaaaa'
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
            const converted = {
                ...routed,
                destinationPeer: nodeFormatPeerDescriptor(routed.destinationPeer!),
                sourcePeer: nodeFormatPeerDescriptor(routed.sourcePeer!)
            }
            const routable = canRoute(converted)

            const response: RouteMessageAck = {
                nonce: routed.nonce,
                destinationPeer: routed.sourcePeer,
                sourcePeer: routed.destinationPeer,
                error: routable ? '' : 'Could not forward the message'
            }
            if (routable) {
                setImmediate(async () => await routeHandler(converted))
            }
            return response
        }
    }

    const RegisterDhtRpc = {
        async getClosestPeers(bytes: Uint8Array): Promise<Uint8Array> {
            const request = ClosestPeersRequest.fromBinary(bytes)
            const response = await DhtRpc.getClosestPeers(request, new DummyServerCallContext())
            return ClosestPeersResponse.toBinary(response)
        },
        async ping(bytes: Uint8Array): Promise<Uint8Array> {
            const request = PingRequest.fromBinary(bytes)
            const response = await DhtRpc.ping(request, new DummyServerCallContext())
            return PingResponse.toBinary(response)
        },
        async routeMessage(bytes: Uint8Array): Promise<Uint8Array> {
            const message = RouteMessageWrapper.fromBinary(bytes)
            const response = await DhtRpc.routeMessage(message, new DummyServerCallContext())
            return RouteMessageAck.toBinary(response)
        }
    }

    return RegisterDhtRpc
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