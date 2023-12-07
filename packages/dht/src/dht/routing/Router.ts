import { Message, PeerDescriptor, RouteMessageAck, RouteMessageError, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import {
    areEqualPeerDescriptors,
    getNodeIdFromPeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, executeSafePromise, raceEvents3, withTimeout } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { PeerIDKey } from '../../helpers/PeerID'
import { DuplicateDetector } from './DuplicateDetector'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { v4 } from 'uuid'
import { RouterRpcLocal, createRouteMessageAck } from './RouterRpcLocal'
import { NodeID } from '../../helpers/nodeId'

export interface RouterConfig {
    rpcCommunicator: RoutingRpcCommunicator
    localPeerDescriptor: PeerDescriptor
    connections: Map<NodeID, DhtNodeRpcRemote>
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    connectionManager?: ConnectionManager
    rpcRequestTimeout?: number

}

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

export interface IRouter {
    doRouteMessage(routedMessage: RouteMessageWrapper, mode: RoutingMode, excludedPeer?: PeerDescriptor): RouteMessageAck
    send(msg: Message, reachableThrough: PeerDescriptor[]): void
    isMostLikelyDuplicate(requestId: string): boolean
    addToDuplicateDetector(requestId: string): void
    addRoutingSession(session: RoutingSession): void
    removeRoutingSession(sessionId: string): void
    stop(): void
}

const logger = new Logger(module)

export class Router implements IRouter {
    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly connections: Map<NodeID, DhtNodeRpcRemote>
    private readonly forwardingTable: Map<PeerIDKey, ForwardingTableEntry> = new Map()
    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    // TODO use config option or named constant?
    private readonly duplicateRequestDetector: DuplicateDetector = new DuplicateDetector(100000, 100)
    private stopped = false

    constructor(config: RouterConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.localPeerDescriptor = config.localPeerDescriptor
        this.connections = config.connections
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: RouterConfig) {
        const rpcLocal = new RouterRpcLocal({
            doRouteMessage: (routedMessage: RouteMessageWrapper, mode?: RoutingMode) => this.doRouteMessage(routedMessage, mode),
            addContact: (contact: PeerDescriptor, setActive: boolean) => config.addContact(contact, setActive),
            setForwardingEntries: (routedMessage: RouteMessageWrapper) => this.setForwardingEntries(routedMessage),
            duplicateRequestDetector: this.duplicateRequestDetector,
            localPeerDescriptor: this.localPeerDescriptor,
            connectionManager: config.connectionManager
        })
        this.rpcCommunicator.registerRpcMethod(
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
        this.rpcCommunicator.registerRpcMethod(
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
        msg.sourceDescriptor = this.localPeerDescriptor
        const targetPeerDescriptor = msg.targetDescriptor!
        const forwardingEntry = this.forwardingTable.get(keyFromPeerDescriptor(targetPeerDescriptor))
        if (forwardingEntry && forwardingEntry.peerDescriptors.length > 0) {
            const forwardingPeer = forwardingEntry.peerDescriptors[0]
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: forwardingPeer,
                sourcePeer: this.localPeerDescriptor,
                reachableThrough,
                routingPath: []
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
                destinationPeer: targetPeerDescriptor,
                sourcePeer: this.localPeerDescriptor,
                reachableThrough,
                routingPath: []
            }
            const ack = this.doRouteMessage(routedMessage, RoutingMode.ROUTE)
            if (ack.error !== undefined) {
                const error = 'Could not route message with error ' + ack.error
                logger.debug(error)
                throw new Error(error)
            }
        }
    }

    public doRouteMessage(routedMessage: RouteMessageWrapper, mode = RoutingMode.ROUTE, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        logger.trace(`Routing message ${routedMessage.requestId} from ${getNodeIdFromPeerDescriptor(routedMessage.sourcePeer!)} `
            + `to ${getNodeIdFromPeerDescriptor(routedMessage.destinationPeer!)}`)
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

    private createRoutingSession(routedMessage: RouteMessageWrapper, mode: RoutingMode, excludedPeer?: PeerDescriptor): RoutingSession {
        const excludedPeers = routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        if (excludedPeer) {
            excludedPeers.push(peerIdFromPeerDescriptor(excludedPeer))
        }
        logger.trace('routing session created with connections: ' + this.connections.size)
        return new RoutingSession(
            this.rpcCommunicator,
            this.localPeerDescriptor,
            routedMessage,
            this.connections,
            // TODO use config option or named constant?
            areEqualPeerDescriptors(this.localPeerDescriptor, routedMessage.sourcePeer!) ? 2 : 1,
            mode,
            excludedPeers
        )
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
    }

    private setForwardingEntries(routedMessage: RouteMessageWrapper): void {
        const reachableThroughWithoutSelf = routedMessage.reachableThrough.filter((peer) => {
            return !areEqualPeerDescriptors(peer, this.localPeerDescriptor)
        })
        
        if (reachableThroughWithoutSelf.length > 0) {
            const sourceKey = keyFromPeerDescriptor(routedMessage.sourcePeer!)
            if (this.forwardingTable.has(sourceKey)) {
                const oldEntry = this.forwardingTable.get(sourceKey)
                clearTimeout(oldEntry!.timeout)
                this.forwardingTable.delete(sourceKey)
            }
            const forwardingEntry: ForwardingTableEntry = {
                peerDescriptors: reachableThroughWithoutSelf,
                timeout: setTimeout(() => {
                    this.forwardingTable.delete(sourceKey)
                }, 10000)  // TODO use config option or named constant?
            }
            this.forwardingTable.set(sourceKey, forwardingEntry)
        }
    }
}
