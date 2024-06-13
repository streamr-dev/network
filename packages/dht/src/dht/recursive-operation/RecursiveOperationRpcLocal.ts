import { Logger } from '@streamr/utils'
import { PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { IRecursiveOperationRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { createRouteMessageAck } from '../routing/RouterRpcLocal'
import { getPreviousPeer } from '../routing/getPreviousPeer'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

interface RecursiveOperationRpcLocalConfig {
    doRouteRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    isMostLikelyDuplicate: (requestId: string) => boolean
    addToDuplicateDetector: (requestId: string) => void
}

export class RecursiveOperationRpcLocal implements IRecursiveOperationRpc {

    private readonly config: RecursiveOperationRpcLocalConfig

    constructor(config: RecursiveOperationRpcLocalConfig) {
        this.config = config
    }

    async routeRequest(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.config.isMostLikelyDuplicate(routedMessage.requestId)) {
            return createRouteMessageAck(routedMessage, RouteMessageError.DUPLICATE)
        }
        const remoteNodeId = getNodeIdFromPeerDescriptor(getPreviousPeer(routedMessage) ?? routedMessage.sourcePeer!)
        logger.trace(`Received routeRequest call from ${remoteNodeId}`)
        this.config.addToDuplicateDetector(routedMessage.requestId)
        return this.config.doRouteRequest(routedMessage)
    }
}
