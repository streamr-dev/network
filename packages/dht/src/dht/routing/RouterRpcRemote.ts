import { Logger, areEqualBinaries } from '@streamr/utils'
import { v4 } from 'uuid'
import {
    getNodeIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { RouterRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from '../contact/RpcRemote'
import { getPreviousPeer } from './getPreviousPeer'

const logger = new Logger(module)

export class RouterRpcRemote extends RpcRemote<RouterRpcClient> {

    async routeMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            target: params.target,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath,
            parallelRootNodeIds: params.parallelRootNodeIds
        }
        const options = this.formDhtRpcOptions({
            connect: false
        })
        try {
            const ack = await this.getClient().routeMessage(message, options)
            // Success signal if sent to destination and error includes duplicate
            if (ack.error === RouteMessageError.DUPLICATE
                && areEqualBinaries(params.target, this.getPeerDescriptor().nodeId)
            ) {
                return true
            } else if (ack.error !== undefined) {
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? getNodeIdFromPeerDescriptor(previousPeer)
                : getNodeIdFromPeerDescriptor(params.sourcePeer!)
            const toNode = getNodeIdFromPeerDescriptor(this.getPeerDescriptor())
            logger.trace(`Failed to send routeMessage from ${fromNode} to ${toNode} with: ${err}`)
            return false
        }
        return true
    }

    async forwardMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            target: params.target,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath,
            parallelRootNodeIds: params.parallelRootNodeIds
        }
        const options = this.formDhtRpcOptions({
            connect: false
        })
        try {
            const ack = await this.getClient().forwardMessage(message, options)
            if (ack.error !== undefined) {
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? getNodeIdFromPeerDescriptor(previousPeer)
                : getNodeIdFromPeerDescriptor(params.sourcePeer!)
            const toNode = getNodeIdFromPeerDescriptor(this.getPeerDescriptor())
            logger.trace(`Failed to send forwardMessage from ${fromNode} to ${toNode} with: ${err}`)
            return false
        }
        return true
    }
}
