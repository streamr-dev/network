import { Logger } from '@streamr/utils'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { IRouterRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DuplicateDetector } from './DuplicateDetector'
import { RoutingMode } from './RoutingSession'

interface RouterRpcLocalConfig {
    doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) => RouteMessageAck
    addContact: (contact: PeerDescriptor, setActive: boolean) => void
    setForwardingEntries: (routedMessage: RouteMessageWrapper) => void
    duplicateRequestDetector: DuplicateDetector
    localPeerDescriptor: PeerDescriptor
    connectionManager?: ConnectionManager
}

const logger = new Logger(module)

export const createRouteMessageAck = (routedMessage: RouteMessageWrapper, error?: RouteMessageError): RouteMessageAck => {
    const ack: RouteMessageAck = {
        requestId: routedMessage.requestId,
        error
    }
    return ack
}

export class RouterRpcLocal implements IRouterRpc {

    private readonly config: RouterRpcLocalConfig

    constructor(config: RouterRpcLocalConfig) {
        this.config = config
    }

    async routeMessage(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.config.duplicateRequestDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Routing message ${routedMessage.requestId} from ${getNodeIdFromPeerDescriptor(routedMessage.sourcePeer!)} `
                + `to ${getNodeIdFromPeerDescriptor(routedMessage.destinationPeer!)} is likely a duplicate`)
            return createRouteMessageAck(routedMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.config.addContact(routedMessage.sourcePeer!, true)
        this.config.duplicateRequestDetector.add(routedMessage.requestId)
        if (areEqualPeerDescriptors(this.config.localPeerDescriptor, routedMessage.destinationPeer!)) {
            logger.trace(`routing message targeted to self ${routedMessage.requestId}`)
            this.config.setForwardingEntries(routedMessage)
            this.config.connectionManager?.handleMessage(routedMessage.message!)
            return createRouteMessageAck(routedMessage)
        } else {
            return this.config.doRouteMessage(routedMessage)
        }
    }

    async forwardMessage(forwardMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.config.duplicateRequestDetector.isMostLikelyDuplicate(forwardMessage.requestId)) {
            logger.trace(`Forwarding message ${forwardMessage.requestId} from ${getNodeIdFromPeerDescriptor(forwardMessage.sourcePeer!)} `
                + `to ${getNodeIdFromPeerDescriptor(forwardMessage.destinationPeer!)} is likely a duplicate`)
            return createRouteMessageAck(forwardMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received forward routeMessage ${forwardMessage.requestId}`)
        this.config.addContact(forwardMessage.sourcePeer!, true)
        this.config.duplicateRequestDetector.add(forwardMessage.requestId)
        if (areEqualPeerDescriptors(this.config.localPeerDescriptor, forwardMessage.destinationPeer!)) {
            return this.forwardToDestination(forwardMessage)
        } else {
            return this.config.doRouteMessage(forwardMessage, RoutingMode.FORWARD)
        }
    }

    private forwardToDestination(routedMessage: RouteMessageWrapper): RouteMessageAck {
        logger.trace(`Forwarding found message targeted to self ${routedMessage.requestId}`)
        const forwardedMessage = routedMessage.message!
        if (areEqualPeerDescriptors(this.config.localPeerDescriptor, forwardedMessage.targetDescriptor!)) {
            this.config.connectionManager?.handleMessage(forwardedMessage)
            return createRouteMessageAck(routedMessage)
        }
        return this.config.doRouteMessage({ ...routedMessage, destinationPeer: forwardedMessage.targetDescriptor })
    }

}
