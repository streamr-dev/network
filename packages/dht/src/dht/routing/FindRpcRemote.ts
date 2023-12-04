import { RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RpcRemote } from '../contact/RpcRemote'
import { Logger } from '@streamr/utils'
import { IFindRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { getPreviousPeer } from './getPreviousPeer'

const logger = new Logger(module)

export class FindRpcRemote extends RpcRemote<IFindRpcClient> {

    async routeFindRequest(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath
        }
        const options = this.formDhtRpcOptions({
            doNotConnect: true
        })
        try {
            const ack = await this.getClient().routeFindRequest(message, options)
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
            logger.debug(`Failed to send routeFindRequest message from ${fromNode} to ${getNodeIdFromPeerDescriptor(this.getPeerDescriptor())} with: ${err}`)
            return false
        }
        return true
    }
}