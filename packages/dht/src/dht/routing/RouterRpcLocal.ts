import { Logger, areEqualBinaries } from '@streamr/utils'
import {
    Message,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../../generated/packages/dht/protos/DhtRpc'
import { IRouterRpc } from '../../../generated/packages/dht/protos/DhtRpc.server'
import { DuplicateDetector } from './DuplicateDetector'
import { RoutingMode } from './RoutingSession'
import { areEqualPeerDescriptors, toDhtAddress, toNodeId } from '../../identifiers'
import { v4 } from 'uuid'

interface RouterRpcLocalOptions {
    doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) => RouteMessageAck
    setForwardingEntries: (routedMessage: RouteMessageWrapper) => void
    handleMessage: (message: Message) => void
    duplicateRequestDetector: DuplicateDetector
    localPeerDescriptor: PeerDescriptor
}

const logger = new Logger(module)

export const createRouteMessageAck = (
    routedMessage: RouteMessageWrapper,
    error?: RouteMessageError
): RouteMessageAck => {
    const ack: RouteMessageAck = {
        requestId: routedMessage.requestId,
        error
    }
    return ack
}

export class RouterRpcLocal implements IRouterRpc {
    private readonly options: RouterRpcLocalOptions

    constructor(options: RouterRpcLocalOptions) {
        this.options = options
    }

    async routeMessage(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.options.duplicateRequestDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(
                `Routing message ${routedMessage.requestId} from ${toNodeId(routedMessage.sourcePeer!)} ` +
                    `to ${toDhtAddress(routedMessage.target)} is likely a duplicate`
            )
            return createRouteMessageAck(routedMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.options.duplicateRequestDetector.add(routedMessage.requestId)
        if (areEqualBinaries(this.options.localPeerDescriptor.nodeId, routedMessage.target)) {
            logger.trace(`routing message targeted to self ${routedMessage.requestId}`)
            this.options.setForwardingEntries(routedMessage)
            this.options.handleMessage(routedMessage.message!)
            return createRouteMessageAck(routedMessage)
        } else {
            return this.options.doRouteMessage(routedMessage)
        }
    }

    async forwardMessage(forwardMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.options.duplicateRequestDetector.isMostLikelyDuplicate(forwardMessage.requestId)) {
            logger.trace(
                `Forwarding message ${forwardMessage.requestId} from ${toNodeId(forwardMessage.sourcePeer!)} ` +
                    `to ${toDhtAddress(forwardMessage.target)} is likely a duplicate`
            )
            return createRouteMessageAck(forwardMessage, RouteMessageError.DUPLICATE)
        }
        logger.trace(`Processing received forward routeMessage ${forwardMessage.requestId}`)
        this.options.duplicateRequestDetector.add(forwardMessage.requestId)
        if (areEqualBinaries(this.options.localPeerDescriptor.nodeId, forwardMessage.target)) {
            return this.forwardToDestination(forwardMessage)
        } else {
            return this.options.doRouteMessage(forwardMessage, RoutingMode.FORWARD)
        }
    }

    private forwardToDestination(routedMessage: RouteMessageWrapper): RouteMessageAck {
        logger.trace(`Forwarding found message targeted to self ${routedMessage.requestId}`)
        const forwardedMessage = routedMessage.message!
        if (areEqualPeerDescriptors(this.options.localPeerDescriptor, forwardedMessage.targetDescriptor!)) {
            this.options.handleMessage(forwardedMessage)
            return createRouteMessageAck(routedMessage)
        }
        return this.options.doRouteMessage({
            ...routedMessage,
            requestId: v4(),
            target: forwardedMessage.targetDescriptor!.nodeId
        })
    }
}
