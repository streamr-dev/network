import { RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Remote } from '../contact/Remote'
import { Logger } from '@streamr/utils'
import { IFindRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { getPreviousPeer } from './getPreviousPeer'

const logger = new Logger(module)

export class FindRpcRemote extends Remote<IFindRpcClient> {

    async routeFindRequest(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options = this.formDhtRpcOptions({
            timeout: 10000
        })
        try {
            const ack = await this.getClient().routeFindRequest(message, options)
            if (ack.error.length > 0) {
                logger.debug('Next hop responded with error ' + ack.error)
                return false
            }
        } catch (err) {
            const previousPeer = getPreviousPeer(params)
            const fromNode = previousPeer
                ? keyFromPeerDescriptor(previousPeer)
                : keyFromPeerDescriptor(params.sourcePeer!)
            // eslint-disable-next-line max-len
            logger.debug(`Failed to send routeFindRequest message from ${fromNode} to ${keyFromPeerDescriptor(this.getPeerDescriptor())} with: ${err}`)
            return false
        }
        return true
    }
}
