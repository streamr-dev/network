import { Message, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { areEqualPeerDescriptors, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, executeSafePromise, raceEvents3, withTimeout } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { PeerIDKey } from '../../helpers/PeerID'
import { DuplicateDetector } from './DuplicateDetector'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { RemoteDhtNode } from '../RemoteDhtNode'
import { v4 } from 'uuid'
import { IRouterRpc } from '../../proto/packages/dht/protos/DhtRpc.server'

export const createRouteMessageAck = (routedMessage: RouteMessageWrapper, error?: string): RouteMessageAck => {
    const ack: RouteMessageAck = {
        requestId: routedMessage.requestId,
        error: error ? error : ''
    }
    return ack
}

export enum RoutingErrors {
    NO_CANDIDATES_FOUND = 'No routing candidates found',
    STOPPED = 'DhtNode Stopped'
}

export interface RouterConfig {
    rpcCommunicator: RoutingRpcCommunicator
    ownPeerDescriptor: PeerDescriptor
    connections: Map<PeerIDKey, RemoteDhtNode>
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    serviceId: string
    connectionManager?: ConnectionManager
}

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

interface IRouterFunc {
    doRouteMessage(routedMessage: RouteMessageWrapper, mode: RoutingMode, excludedPeer?: PeerDescriptor): RouteMessageAck
    send(msg: Message, reachableThrough: PeerDescriptor[]): Promise<void>
    isMostLikelyDuplicate(requestId: string): boolean
    addToDuplicateDetector(requestId: string): void
    addRoutingSession(session: RoutingSession): void
    removeRoutingSession(sessionId: string): void
    stop(): void
}

export interface IRouter extends Omit<IRouterRpc, 'findRecursively'>, IRouterFunc {}

const logger = new Logger(module)

export class Router implements IRouter {
    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly connections: Map<PeerIDKey, RemoteDhtNode>
    private readonly addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    private readonly serviceId: string
    private readonly connectionManager?: ConnectionManager
    private readonly forwardingTable: Map<string, ForwardingTableEntry> = new Map()
    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    private readonly duplicateRequestDetector: DuplicateDetector = new DuplicateDetector(100000, 100)
    private stopped = false

    constructor(config: RouterConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.connections = config.connections
        this.addContact = config.addContact
        this.serviceId = config.serviceId
        this.connectionManager = config.connectionManager
        this.rpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'forwardMessage',
            (forwardMessage: RouteMessageWrapper) => this.forwardMessage(forwardMessage))
        this.rpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage',
            (routedMessage: RouteMessageWrapper) => this.routeMessage(routedMessage))
    }

    public async send(msg: Message, reachableThrough: PeerDescriptor[]): Promise<void> {
        msg.sourceDescriptor = this.ownPeerDescriptor
        const targetPeerDescriptor = msg.targetDescriptor!
        const forwardingEntry = this.forwardingTable.get(keyFromPeerDescriptor(targetPeerDescriptor))
        if (forwardingEntry && forwardingEntry.peerDescriptors.length > 0) {
            const forwardingPeer = forwardingEntry.peerDescriptors[0]
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: forwardingPeer,
                sourcePeer: this.ownPeerDescriptor,
                reachableThrough,
                routingPath: []
            }
            this.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
        } else {
            const routedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: targetPeerDescriptor,
                sourcePeer: this.ownPeerDescriptor,
                reachableThrough,
                routingPath: []
            }
            this.doRouteMessage(routedMessage, RoutingMode.ROUTE)
        }
    }

    public doRouteMessage(routedMessage: RouteMessageWrapper, mode = RoutingMode.ROUTE, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RoutingErrors.STOPPED)
        }
        logger.trace(`Routing message ${routedMessage.requestId} from ${keyFromPeerDescriptor(routedMessage.sourcePeer!)} `
            + `to ${keyFromPeerDescriptor(routedMessage.destinationPeer!)}`)
        routedMessage.routingPath.push(this.ownPeerDescriptor)
        const session = this.createRoutingSession(routedMessage, mode, excludedPeer)
        this.addRoutingSession(session)
        try {
            // eslint-disable-next-line promise/catch-or-return
            logger.trace('starting to raceEvents from routingSession: ' + session.sessionId)
            let eventReceived: Promise<unknown>
            executeSafePromise(async () => {
                eventReceived = raceEvents3<RoutingSessionEvents>(
                    session,
                    ['routingSucceeded', 'partialSuccess', 'routingFailed', 'stopped', 'noCandidatesFound'],
                    null
                )
            })
            setImmediate(async () => {
                try {
                    await withTimeout(eventReceived, 10000)
                    logger.trace('raceEvents ended from routingSession: ' + session.sessionId)
                } catch (e) {
                    logger.trace('raceEvents timed out for routingSession ' + session.sessionId) 
                }
                this.removeRoutingSession(session.sessionId) 
            })
            session.start()
        } catch (e) {
            if (areEqualPeerDescriptors(routedMessage.sourcePeer!, this.ownPeerDescriptor)) {
                logger.warn(
                    `Failed to send (routeMessage: ${this.serviceId}) to ${keyFromPeerDescriptor(routedMessage.destinationPeer!)}: ${e}`
                )
            }
            return createRouteMessageAck(routedMessage, RoutingErrors.NO_CANDIDATES_FOUND)
        }
        return createRouteMessageAck(routedMessage)
    }

    private createRoutingSession(routedMessage: RouteMessageWrapper, mode: RoutingMode, excludedPeer?: PeerDescriptor): RoutingSession {
        const excludedPeers = routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        if (excludedPeer) {
            excludedPeers.push(peerIdFromPeerDescriptor(excludedPeer))
        }
        logger.trace(' routing session created with connections: ' + this.connections.size )
        return new RoutingSession(
            this.rpcCommunicator,
            this.ownPeerDescriptor,
            routedMessage,
            this.connections,
            areEqualPeerDescriptors(this.ownPeerDescriptor, routedMessage.sourcePeer!) ? 2 : 1,
            mode,
            undefined,
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
    
    // IRouterRpc method
    async routeMessage(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'routeMessage() service is not running')
        } else if (this.duplicateRequestDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Routing message ${routedMessage.requestId} from ${keyFromPeerDescriptor(routedMessage.sourcePeer!)} `
                + `to ${keyFromPeerDescriptor(routedMessage.destinationPeer!)} is likely a duplicate`)
            return createRouteMessageAck(routedMessage, 'message given to routeMessage() service is likely a duplicate')
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.addContact(routedMessage.sourcePeer!, true)
        this.addToDuplicateDetector(routedMessage.requestId)
        if (areEqualPeerDescriptors(this.ownPeerDescriptor, routedMessage.destinationPeer!)) {
            logger.trace(`routing message targeted to self ${routedMessage.requestId}`)
            this.setForwardingEntries(routedMessage)
            this.connectionManager?.handleMessage(routedMessage.message!)
            return createRouteMessageAck(routedMessage)
        } else {
            return this.doRouteMessage(routedMessage)
        }
    }

    private setForwardingEntries(routedMessage: RouteMessageWrapper): void {
        const reachableThroughWithoutSelf = routedMessage.reachableThrough.filter((peer) => {
            return !areEqualPeerDescriptors(peer, this.ownPeerDescriptor)
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
                }, 10000)
            }
            this.forwardingTable.set(sourceKey, forwardingEntry)
        }
    }

    // IRouterRpc method
    async forwardMessage(forwardMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(forwardMessage, 'forwardMessage() service is not running')
        } else if (this.duplicateRequestDetector.isMostLikelyDuplicate(forwardMessage.requestId)) {
            logger.trace(`Forwarding message ${forwardMessage.requestId} from ${keyFromPeerDescriptor(forwardMessage.sourcePeer!)} `
                + `to ${keyFromPeerDescriptor(forwardMessage.destinationPeer!)} is likely a duplicate`)
            return createRouteMessageAck(forwardMessage, 'message given to forwardMessage() service is likely a duplicate')
        }
        logger.trace(`Processing received forward routeMessage ${forwardMessage.requestId}`)
        this.addContact(forwardMessage.sourcePeer!, true)
        this.addToDuplicateDetector(forwardMessage.requestId)
        if (areEqualPeerDescriptors(this.ownPeerDescriptor, forwardMessage.destinationPeer!)) {
            return this.forwardToDestination(forwardMessage)
        } else {
            return this.doRouteMessage(forwardMessage, RoutingMode.FORWARD)
        }
    }

    private forwardToDestination(routedMessage: RouteMessageWrapper): RouteMessageAck {
        logger.trace(`Forwarding found message targeted to self ${routedMessage.requestId}`)
        const forwardedMessage = routedMessage.message!
        if (areEqualPeerDescriptors(this.ownPeerDescriptor, forwardedMessage.targetDescriptor!)) {
            this.connectionManager?.handleMessage(forwardedMessage)
            return createRouteMessageAck(routedMessage)
        }
        return this.doRouteMessage({ ...routedMessage, destinationPeer: forwardedMessage.targetDescriptor })
    }

}
