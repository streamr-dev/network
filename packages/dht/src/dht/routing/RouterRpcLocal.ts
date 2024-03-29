import { Logger, areEqualBinaries } from '@streamr/utils'
import { Message, PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { IRouterRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DuplicateDetector } from './DuplicateDetector'
import { RoutingMode } from './RoutingSession'
import { areEqualPeerDescriptors, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { v4 } from 'uuid'

interface RouterRpcLocalConfig {
    doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) => RouteMessageAck
    setForwardingEntries: (routedMessage: RouteMessageWrapper) => void
    handleMessage: (message: Message) => void
    duplicateRequestDetector: DuplicateDetector
    localPeerDescriptor: PeerDescriptor
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
                + `to ${getDhtAddressFromRaw(routedMessage.target)} is likely a duplicate`)
            return createRouteMessageAck(routedMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.config.duplicateRequestDetector.add(routedMessage.requestId)
        if (areEqualBinaries(this.config.localPeerDescriptor.nodeId, routedMessage.target)) {
            logger.trace(`routing message targeted to self ${routedMessage.requestId}`)
            this.config.setForwardingEntries(routedMessage)
            this.config.handleMessage(routedMessage.message!)
            return createRouteMessageAck(routedMessage)
        } else {
            return this.config.doRouteMessage(routedMessage)
        }
    }

    async forwardMessage(forwardMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.config.duplicateRequestDetector.isMostLikelyDuplicate(forwardMessage.requestId)) {
            logger.trace(`Forwarding message ${forwardMessage.requestId} from ${getNodeIdFromPeerDescriptor(forwardMessage.sourcePeer!)} `
                + `to ${getDhtAddressFromRaw(forwardMessage.target)} is likely a duplicate`)
            return createRouteMessageAck(forwardMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received forward routeMessage ${forwardMessage.requestId}`)
        this.config.duplicateRequestDetector.add(forwardMessage.requestId)
        if (areEqualBinaries(this.config.localPeerDescriptor.nodeId, forwardMessage.target)) {
            return this.forwardToDestination(forwardMessage)
        } else {
            return this.config.doRouteMessage(forwardMessage, RoutingMode.FORWARD)
        }
    }

    private forwardToDestination(routedMessage: RouteMessageWrapper): RouteMessageAck {
        logger.trace(`Forwarding found message targeted to self ${routedMessage.requestId}`)
        const forwardedMessage = routedMessage.message!
        if (areEqualPeerDescriptors(this.config.localPeerDescriptor, forwardedMessage.targetDescriptor!)) {
            this.config.handleMessage(forwardedMessage)
            return createRouteMessageAck(routedMessage)
        }
        return this.config.doRouteMessage({ ...routedMessage, requestId: v4(), target: forwardedMessage.targetDescriptor!.nodeId })
    }

}
