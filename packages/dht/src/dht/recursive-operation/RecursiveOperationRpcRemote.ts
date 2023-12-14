import { RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RpcRemote } from '../contact/RpcRemote'
import { Logger } from '@streamr/utils'
import { IRecursiveOperationRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { getPreviousPeer } from '../routing/getPreviousPeer'

const logger = new Logger(module)

export class RecursiveOperationRpcRemote extends RpcRemote<IRecursiveOperationRpcClient> {

    async routeRequest(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath
        }
        const options = this.formDhtRpcOptions({
            connect: false
        })
        try {
            const ack = await this.getClient().routeRequest(message, options)
            if (ack.error !== undefined) {
                logger.trace('Next hop responded with error ' + ack.error)
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? getNodeIdFromPeerDescriptor(previousPeer)
                : getNodeIdFromPeerDescriptor(params.sourcePeer!)
            // eslint-disable-next-line max-len
            logger.debug(`Failed to send routeRequest message from ${fromNode} to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} with: ${err}`)
            return false
        }
        return true
    }
}
