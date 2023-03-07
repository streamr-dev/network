import { PeerDescriptor, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import {
    isSamePeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { IRoutingServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Remote } from '../contact/Remote'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class RemoteRouter extends Remote<IRoutingServiceClient> {

    async routeMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            logger.trace('calling dhtClient.routeMessage')
            const ack = await this.client.routeMessage(message, options)
            logger.trace('dhtClient.routeMessage returned')
            // Success signal if sent to destination and error includes duplicate
            if (
                isSamePeerDescriptor(params.destinationPeer!, this.peerDescriptor)
                && ack.error.includes('duplicate')
            ) {
                return true
            } else if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ?
                peerIdFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)
            logger.debug(`Failed to send routeMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`)
            return false
        }
        return true
    }

    async forwardMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            const ack = await this.client.forwardMessage(message, options)
            if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ?
                keyFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)

            logger.debug(
                `Failed to send forwardMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`
            )
            return false
        }
        return true
    }

    async findRecursively(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            const ack = await this.client.findRecursively(message, options)
            if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ? keyFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)
            logger.debug(`Failed to send routeMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`)
            return false
        }
        return true
    }

}
