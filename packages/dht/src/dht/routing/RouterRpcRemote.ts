import { RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { IRouterRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Remote } from '../contact/Remote'
import { Logger } from '@streamr/utils'
import { getPreviousPeer } from './getPreviousPeer'

const logger = new Logger(module)

export class RouterRpcRemote extends Remote<IRouterRpcClient> {

    async routeMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath
        }
        const options = this.formDhtRpcOptions()
        try {
            const ack = await this.getClient().routeMessage(message, options)
            // Success signal if sent to destination and error includes duplicate
            if (
                areEqualPeerDescriptors(params.destinationPeer!, this.getPeerDescriptor())
                && ack.error.includes('duplicate')
            ) {
                return true
            } else if (ack.error.length > 0) {
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? peerIdFromPeerDescriptor(previousPeer)
                : keyFromPeerDescriptor(params.sourcePeer!)
            logger.trace(`Failed to send routeMessage from ${fromNode} to ${keyFromPeerDescriptor(this.getPeerDescriptor())} with: ${err}`)
            return false
        }
        return true
    }

    async forwardMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId ?? v4(),
            reachableThrough: params.reachableThrough ?? [],
            routingPath: params.routingPath
        }
        const options = this.formDhtRpcOptions()
        try {
            const ack = await this.getClient().forwardMessage(message, options)
            if (ack.error.length > 0) {
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? keyFromPeerDescriptor(previousPeer)
                : keyFromPeerDescriptor(params.sourcePeer!)
            logger.trace(
                `Failed to send forwardMessage from ${fromNode} to ${keyFromPeerDescriptor(this.getPeerDescriptor())} with: ${err}`
            )
            return false
        }
        return true
    }
}
