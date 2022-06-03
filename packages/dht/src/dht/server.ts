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
import { nodeFormatPeerDescriptor } from '../helpers/common'
import { DhtPeer } from './DhtPeer'
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
                setImmediate(async () => {
                    try {
                        await routeHandler(converted)
                    } catch (err) {}
                })
            }
            return response
        }
    }
    return DhtRpc
}