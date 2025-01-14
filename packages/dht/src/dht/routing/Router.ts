import {
    Message,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../../generated/packages/dht/protos/DhtRpc'
import { RoutingMode, RoutingRemoteContact, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, executeSafePromise, raceEvents3, withTimeout } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { DuplicateDetector } from './DuplicateDetector'
import { v4 } from 'uuid'
import { RouterRpcLocal, createRouteMessageAck } from './RouterRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, toDhtAddress, toNodeId } from '../../identifiers'
import { RoutingTablesCache } from './RoutingTablesCache'

export interface RouterOptions {
    rpcCommunicator: RoutingRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    handleMessage: (message: Message) => void
    getConnections: () => PeerDescriptor[]
}

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

const logger = new Logger(module)

export class Router {
    private readonly forwardingTable: Map<DhtAddress, ForwardingTableEntry> = new Map()
    private readonly routingTablesCache = new RoutingTablesCache()
    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    // TODO use options option or named constant?
    private readonly duplicateRequestDetector: DuplicateDetector = new DuplicateDetector(10000)
    private stopped = false
    private readonly options: RouterOptions
    private messagesRouted = 0
    private messagesSent = 0

    constructor(options: RouterOptions) {
        this.options = options
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RouterRpcLocal({
            doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) =>
                this.doRouteMessage(routedMessage, mode),
            setForwardingEntries: (routedMessage: RouteMessageWrapper) => this.setForwardingEntries(routedMessage),
            duplicateRequestDetector: this.duplicateRequestDetector,
            localPeerDescriptor: this.options.localPeerDescriptor,
            handleMessage: this.options.handleMessage
        })
        this.options.rpcCommunicator.registerRpcMethod(
            RouteMessageWrapper,
            RouteMessageAck,
            'routeMessage',
            async (routedMessage: RouteMessageWrapper) => {
                if (this.stopped) {
                    return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
                }
                return rpcLocal.routeMessage(routedMessage)
            }
        )
        this.options.rpcCommunicator.registerRpcMethod(
            RouteMessageWrapper,
            RouteMessageAck,
            'forwardMessage',
            async (forwardMessage: RouteMessageWrapper) => {
                if (this.stopped) {
                    return createRouteMessageAck(forwardMessage, RouteMessageError.STOPPED)
                }
                return rpcLocal.forwardMessage(forwardMessage)
            }
        )
    }

    public send(msg: Message, reachableThrough: PeerDescriptor[]): void {
        msg.sourceDescriptor = this.options.localPeerDescriptor
        const targetPeerDescriptor = msg.targetDescriptor!
        const forwardingEntry = this.forwardingTable.get(toNodeId(targetPeerDescriptor))
        if (forwardingEntry && forwardingEntry.peerDescriptors.length > 0) {
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                target: forwardingEntry.peerDescriptors[0].nodeId,
                sourcePeer: this.options.localPeerDescriptor,
                reachableThrough,
                routingPath: [],
                parallelRootNodeIds: []
            }
            const ack = this.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
            if (ack.error !== undefined) {
                const error = 'Could not forward message with error ' + ack.error
                logger.debug(error)
                throw new Error(error)
            }
        } else {
            const routedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                target: targetPeerDescriptor.nodeId,
                sourcePeer: this.options.localPeerDescriptor,
                reachableThrough,
                routingPath: [],
                parallelRootNodeIds: []
            }
            const ack = this.doRouteMessage(routedMessage, RoutingMode.ROUTE)
            if (ack.error !== undefined) {
                const error = 'Could not route message with error ' + ack.error
                logger.debug(error)
                throw new Error(error)
            }
        }
        this.messagesSent += 1
    }

    public doRouteMessage(
        routedMessage: RouteMessageWrapper,
        mode = RoutingMode.ROUTE,
        excludedPeer?: DhtAddress
    ): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        logger.trace(
            `Routing message ${routedMessage.requestId} from ${toNodeId(routedMessage.sourcePeer!)} ` +
                `to ${toDhtAddress(routedMessage.target)}`
        )
        const session = this.createRoutingSession(routedMessage, mode, excludedPeer)
        const contacts = session.updateAndGetRoutablePeers()
        if (contacts.length > 0) {
            this.addRoutingSession(session)
            logger.trace('starting to raceEvents from routingSession: ' + session.sessionId)
            let eventReceived: Promise<unknown>
            executeSafePromise(async () => {
                eventReceived = raceEvents3<RoutingSessionEvents>(
                    session,
                    ['routingSucceeded', 'partialSuccess', 'routingFailed', 'stopped'],
                    null
                )
            })
            setImmediate(async () => {
                try {
                    // TODO use options option or named constant?
                    await withTimeout(eventReceived, 10000)
                    logger.trace('raceEvents ended from routingSession: ' + session.sessionId)
                } catch {
                    logger.trace('raceEvents timed out for routingSession ' + session.sessionId)
                }
                session.stop()
                this.removeRoutingSession(session.sessionId)
            })
            session.sendMoreRequests(contacts)
            this.messagesRouted += 1
            return createRouteMessageAck(routedMessage)
        } else {
            logger.trace('no targets', { sessionId: session.sessionId })
            return createRouteMessageAck(routedMessage, RouteMessageError.NO_TARGETS)
        }
    }

    private createRoutingSession(
        routedMessage: RouteMessageWrapper,
        mode: RoutingMode,
        excludedNode?: DhtAddress
    ): RoutingSession {
        const excludedNodeIds = new Set<DhtAddress>(routedMessage.routingPath.map((descriptor) => toNodeId(descriptor)))
        if (excludedNode) {
            excludedNodeIds.add(excludedNode)
        }
        routedMessage.parallelRootNodeIds.forEach((nodeId) => {
            excludedNodeIds.add(nodeId as DhtAddress)
        })
        return new RoutingSession({
            rpcCommunicator: this.options.rpcCommunicator,
            localPeerDescriptor: this.options.localPeerDescriptor,
            routedMessage,
            // TODO use options option or named constant?
            parallelism: areEqualPeerDescriptors(this.options.localPeerDescriptor, routedMessage.sourcePeer!) ? 2 : 1,
            mode,
            excludedNodeIds,
            routingTablesCache: this.routingTablesCache,
            getConnections: this.options.getConnections
        })
    }

    public isMostLikelyDuplicate(requestId: string): boolean {
        return this.duplicateRequestDetector.isMostLikelyDuplicate(requestId)
    }

    public addToDuplicateDetector(requestId: string): void {
        this.duplicateRequestDetector.add(requestId)
    }

    public addRoutingSession(session: RoutingSession): void {
        this.ongoingRoutingSessions.set(session.sessionId, session)
    }

    public removeRoutingSession(sessionId: string): void {
        this.ongoingRoutingSessions.delete(sessionId)
    }

    onNodeConnected(peerDescriptor: PeerDescriptor): void {
        const remote = new RoutingRemoteContact(
            peerDescriptor,
            this.options.localPeerDescriptor,
            this.options.rpcCommunicator
        )
        this.routingTablesCache.onNodeConnected(remote)
    }

    onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        this.routingTablesCache.onNodeDisconnected(toNodeId(peerDescriptor))
    }

    public resetCache(): void {
        this.routingTablesCache.reset()
    }

    public stop(): void {
        this.stopped = true
        this.ongoingRoutingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.ongoingRoutingSessions.clear()
        this.forwardingTable.forEach((entry) => {
            clearTimeout(entry.timeout)
        })
        this.forwardingTable.clear()
        this.duplicateRequestDetector.clear()
        this.routingTablesCache.reset()
    }

    getDiagnosticInfo(): Record<string, unknown> {
        return {
            messagesRouted: this.messagesRouted,
            messagesSent: this.messagesSent
        }
    }

    private setForwardingEntries(routedMessage: RouteMessageWrapper): void {
        const reachableThroughWithoutSelf = routedMessage.reachableThrough.filter((peer) => {
            return !areEqualPeerDescriptors(peer, this.options.localPeerDescriptor)
        })

        if (reachableThroughWithoutSelf.length > 0) {
            const sourceNodeId = toNodeId(routedMessage.sourcePeer!)
            if (this.forwardingTable.has(sourceNodeId)) {
                const oldEntry = this.forwardingTable.get(sourceNodeId)
                clearTimeout(oldEntry!.timeout)
                this.forwardingTable.delete(sourceNodeId)
            }
            const forwardingEntry: ForwardingTableEntry = {
                peerDescriptors: reachableThroughWithoutSelf,
                timeout: setTimeout(() => {
                    this.forwardingTable.delete(sourceNodeId)
                }, 10000) // TODO use options option or named constant?
            }
            this.forwardingTable.set(sourceNodeId, forwardingEntry)
        }
    }
}
