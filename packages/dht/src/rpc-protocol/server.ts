import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PingRequest,
    PingResponse,
    RouteMessageWrapper,
    RouteMessageAck
} from '../proto/DhtRpc'
import { IDhtRpc } from '../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DummyServerCallContext } from '../transport/ServerTransport'
import { nodeFormatPeerDescriptor } from '../dht/helpers'
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