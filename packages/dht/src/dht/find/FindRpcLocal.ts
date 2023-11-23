import { Logger } from '@streamr/utils'
import { PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { IFindRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { createRouteMessageAck } from '../routing/RouterRpcLocal'
import { getPreviousPeer } from '../routing/getPreviousPeer'

const logger = new Logger(module)

interface FindRpcLocalConfig {
    doRouteFindRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    isMostLikelyDuplicate: (requestId: string) => boolean
    addToDuplicateDetector: (requestId: string) => void
}

export class FindRpcLocal implements IFindRpc {

    private readonly config: FindRpcLocalConfig

    constructor(config: FindRpcLocalConfig) {
        this.config = config
    }

    async routeFindRequest(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.config.isMostLikelyDuplicate(routedMessage.requestId)) {
            return createRouteMessageAck(routedMessage, RouteMessageError.DUPLICATE)
        }
        const senderId = getNodeIdFromPeerDescriptor(getPreviousPeer(routedMessage) ?? routedMessage.sourcePeer!)
        logger.trace(`Received routeFindRequest call from ${senderId}`)
        this.config.addContact(routedMessage.sourcePeer!, true)
        this.config.addToDuplicateDetector(routedMessage.requestId)
        return this.config.doRouteFindRequest(routedMessage)
    }
}
