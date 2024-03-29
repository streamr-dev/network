import { Message, PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { RoutingMode, RoutingRemoteContact, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, executeSafePromise, raceEvents3, withTimeout } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { DuplicateDetector } from './DuplicateDetector'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { v4 } from 'uuid'
import { RouterRpcLocal, createRouteMessageAck } from './RouterRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { RoutingTablesCache } from './RoutingTablesCache'

export interface RouterConfig {
    rpcCommunicator: RoutingRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    connections: Map<DhtAddress, DhtNodeRpcRemote>
    handleMessage: (message: Message) => void
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
    // TODO use config option or named constant?
    private readonly duplicateRequestDetector: DuplicateDetector = new DuplicateDetector(10000)
    private stopped = false
    private readonly config: RouterConfig

    constructor(config: RouterConfig) {
        this.config = config
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RouterRpcLocal({
            doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) => this.doRouteMessage(routedMessage, mode),
            setForwardingEntries: (routedMessage: RouteMessageWrapper) => this.setForwardingEntries(routedMessage),
            duplicateRequestDetector: this.duplicateRequestDetector,
            localPeerDescriptor: this.config.localPeerDescriptor,
            handleMessage: this.config.handleMessage
        })
        this.config.rpcCommunicator.registerRpcMethod(
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
        this.config.rpcCommunicator.registerRpcMethod(
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
        msg.sourceDescriptor = this.config.localPeerDescriptor
        const targetPeerDescriptor = msg.targetDescriptor!
        const forwardingEntry = this.forwardingTable.get(getNodeIdFromPeerDescriptor(targetPeerDescriptor))
        if (forwardingEntry && forwardingEntry.peerDescriptors.length > 0) {
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                target: forwardingEntry.peerDescriptors[0].nodeId,
                sourcePeer: this.config.localPeerDescriptor,
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
                sourcePeer: this.config.localPeerDescriptor,
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
    }

    public doRouteMessage(routedMessage: RouteMessageWrapper, mode = RoutingMode.ROUTE, excludedPeer?: DhtAddress): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        logger.trace(`Routing message ${routedMessage.requestId} from ${getNodeIdFromPeerDescriptor(routedMessage.sourcePeer!)} `
            + `to ${getDhtAddressFromRaw(routedMessage.target)}`)
        const session = this.createRoutingSession(routedMessage, mode, excludedPeer)
        const contacts = session.updateAndGetRoutablePeers()
        if (contacts.length > 0) {
            this.addRoutingSession(session)
            // eslint-disable-next-line promise/catch-or-return
            logger.trace('starting to raceEvents from routingSession: ' + session.sessionId)
            let eventReceived: Promise<unknown>
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            executeSafePromise(async () => {
                eventReceived = raceEvents3<RoutingSessionEvents>(
                    session,
                    ['routingSucceeded', 'partialSuccess', 'routingFailed', 'stopped'],
                    null
                )
            })
            setImmediate(async () => {
                try {
                    // TODO use config option or named constant?
                    await withTimeout(eventReceived, 10000)
                    logger.trace('raceEvents ended from routingSession: ' + session.sessionId)
                } catch (e) {
                    logger.trace('raceEvents timed out for routingSession ' + session.sessionId) 
                }
                session.stop()
                this.removeRoutingSession(session.sessionId) 
            })
            session.sendMoreRequests(contacts)
            return createRouteMessageAck(routedMessage)
        } else {
            logger.trace('no targets', { sessionId: session.sessionId })
            return createRouteMessageAck(routedMessage, RouteMessageError.NO_TARGETS)
        }
    }

    private createRoutingSession(routedMessage: RouteMessageWrapper, mode: RoutingMode, excludedNode?: DhtAddress): RoutingSession {
        const excludedNodeIds = new Set<DhtAddress>(routedMessage.routingPath.map((descriptor) => getNodeIdFromPeerDescriptor(descriptor)))
        if (excludedNode) {
            excludedNodeIds.add(excludedNode)
        }
        routedMessage.parallelRootNodeIds.forEach((nodeId) => {
            excludedNodeIds.add(nodeId as DhtAddress)
        })
        logger.trace('routing session created with connections: ' + this.config.connections.size)
        return new RoutingSession({
            rpcCommunicator: this.config.rpcCommunicator,
            localPeerDescriptor: this.config.localPeerDescriptor,
            routedMessage,
            connections: this.config.connections,
            // TODO use config option or named constant?
            parallelism: areEqualPeerDescriptors(this.config.localPeerDescriptor, routedMessage.sourcePeer!) ? 2 : 1,
            mode,
            excludedNodeIds,
            routingTablesCache: this.routingTablesCache
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
        const remote = new RoutingRemoteContact(peerDescriptor, this.config.localPeerDescriptor, this.config.rpcCommunicator)
        this.routingTablesCache.onNodeConnected(remote)
    }

    onNodeDisconnected(peerDescriptor: PeerDescriptor): void {
        this.routingTablesCache.onNodeDisconnected(getNodeIdFromPeerDescriptor(peerDescriptor))
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

    private setForwardingEntries(routedMessage: RouteMessageWrapper): void {
        const reachableThroughWithoutSelf = routedMessage.reachableThrough.filter((peer) => {
            return !areEqualPeerDescriptors(peer, this.config.localPeerDescriptor)
        })
        
        if (reachableThroughWithoutSelf.length > 0) {
            const sourceNodeId = getNodeIdFromPeerDescriptor(routedMessage.sourcePeer!)
            if (this.forwardingTable.has(sourceNodeId)) {
                const oldEntry = this.forwardingTable.get(sourceNodeId)
                clearTimeout(oldEntry!.timeout)
                this.forwardingTable.delete(sourceNodeId)
            }
            const forwardingEntry: ForwardingTableEntry = {
                peerDescriptors: reachableThroughWithoutSelf,
                timeout: setTimeout(() => {
                    this.forwardingTable.delete(sourceNodeId)
                }, 10000)  // TODO use config option or named constant?
            }
            this.forwardingTable.set(sourceNodeId, forwardingEntry)
        }
    }
}
