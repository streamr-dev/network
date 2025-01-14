import { Logger, areEqualBinaries } from '@streamr/utils'
import { v4 } from 'uuid'
import { RouteMessageError, RouteMessageWrapper } from '../../../generated/packages/dht/protos/DhtRpc'
import { RouterRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from '../contact/RpcRemote'
import { getPreviousPeer } from './getPreviousPeer'
import { toNodeId } from '../../identifiers'

const logger = new Logger(module)

// default timeout
export const ROUTING_TIMEOUT = 2000

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
            if (
                ack.error === RouteMessageError.DUPLICATE &&
                areEqualBinaries(params.target, this.getPeerDescriptor().nodeId)
            ) {
                return true
            } else if (ack.error !== undefined) {
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer ? toNodeId(previousPeer) : toNodeId(params.sourcePeer!)
            const toNode = toNodeId(this.getPeerDescriptor())
            logger.trace(`Failed to send routeMessage from ${fromNode} to ${toNode}`, { err })
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
            const fromNode = previousPeer ? toNodeId(previousPeer) : toNodeId(params.sourcePeer!)
            const toNode = toNodeId(this.getPeerDescriptor())
            logger.trace(`Failed to send forwardMessage from ${fromNode} to ${toNode}`, { err })
            return false
        }
        return true
    }
}
