import { Message, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, raceEvents3 } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DuplicateDetector } from '../DuplicateDetector'
import { ConnectionManager } from '../../connection/ConnectionManager'
import { DhtPeer } from '../DhtPeer'
import { v4 } from 'uuid'
import { IRoutingService } from '../../proto/packages/dht/protos/DhtRpc.server'

export const createRouteMessageAck = (routedMessage: RouteMessageWrapper, error?: string): RouteMessageAck => {
    const ack: RouteMessageAck = {
        requestId: routedMessage.requestId,
        destinationPeer: routedMessage.sourcePeer,
        sourcePeer: routedMessage.destinationPeer,
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
    ownPeerId: PeerID
    connections: Map<PeerIDKey, DhtPeer>
    routeMessageTimeout: number
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    serviceId: string
    connectionManager?: ConnectionManager
}

interface ForwardingTableEntry {
    timeout: NodeJS.Timeout
    peerDescriptors: PeerDescriptor[]
}

const logger = new Logger(module)

export class Router implements Omit<IRoutingService, 'findRecursively'> {
    private readonly config: RouterConfig
    private readonly forwardingTable: Map<string, ForwardingTableEntry> = new Map()
    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    private readonly routerDuplicateDetector: DuplicateDetector = new DuplicateDetector(100000, 100)
    private stopped = false

    constructor(config: RouterConfig) {
        this.config = config
        this.routeMessage = this.routeMessage.bind(this)
        this.forwardMessage = this.forwardMessage.bind(this)
        this.config.rpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'forwardMessage', this.forwardMessage)
        this.config.rpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeMessage', this.routeMessage)
    }

    public async send(msg: Message, reachableThrough: PeerDescriptor[]): Promise<void> {
        msg.sourceDescriptor = this.config.ownPeerDescriptor
        const targetPeerDescriptor = msg.targetDescriptor!
        const forwardingEntry = this.forwardingTable.get(keyFromPeerDescriptor(targetPeerDescriptor))
        if (forwardingEntry && forwardingEntry.peerDescriptors.length > 0) {
            const forwardingPeer = forwardingEntry.peerDescriptors[0]
            const forwardedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: forwardingPeer,
                sourcePeer: this.config.ownPeerDescriptor!,
                reachableThrough: [],
                routingPath: []
            }
            this.doRouteMessage(forwardedMessage, RoutingMode.FORWARD)
        } else {
            const routedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: targetPeerDescriptor,
                sourcePeer: this.config.ownPeerDescriptor!,
                reachableThrough,
                routingPath: []
            }
            this.doRouteMessage(routedMessage, RoutingMode.FORWARD)
        }
    }

    public doRouteMessage(routedMessage: RouteMessageWrapper, mode = RoutingMode.ROUTE): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RoutingErrors.STOPPED)
        }
        logger.trace(`Peer ${this.config.ownPeerId.value} routing message ${routedMessage.requestId} 
            from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId}`)
        routedMessage.routingPath.push(this.config.ownPeerDescriptor!)
        const session = this.createRoutingSession(routedMessage, mode)
        this.addRoutingSession(session)
        try {
            // eslint-disable-next-line promise/catch-or-return
            raceEvents3<RoutingSessionEvents>(session, ['routingSucceeded', 'routingFailed', 'stopped'], 10000)
                .then(() => this.removeRoutingSession(session.sessionId))
                .catch(() => this.removeRoutingSession(session.sessionId))
            session.start()
        } catch (e) {
            if (peerIdFromPeerDescriptor(routedMessage.sourcePeer!).equals(this.config.ownPeerId!)) {
                logger.warn(
                    `Failed to send (routeMessage: ${this.config.serviceId}) to ${keyFromPeerDescriptor(routedMessage.destinationPeer!)}: ${e}`
                )
            }
            return createRouteMessageAck(routedMessage, RoutingErrors.NO_CANDIDATES_FOUND)
        }
        return createRouteMessageAck(routedMessage)
    }

    private createRoutingSession(routedMessage: RouteMessageWrapper, mode: RoutingMode): RoutingSession {
        return new RoutingSession(
            this.config.rpcCommunicator,
            this.config.ownPeerDescriptor!,
            routedMessage,
            this.config.connections,
            this.config.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.sourcePeer!)) ? 2 : 1,
            this.config.routeMessageTimeout,
            mode,
            undefined,
            routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        )
    }

    public checkDuplicate(messageId: string): boolean {
        return this.routerDuplicateDetector.isMostLikelyDuplicate(messageId)
    }

    public addToDuplicateDetector(messageId: string, senderId: string, message?: Message): void {
        this.routerDuplicateDetector.add(messageId, senderId, message)
    }

    public addRoutingSession(session: RoutingSession): void {
        this.ongoingRoutingSessions.set(session.sessionId, session)
    }

    public removeRoutingSession(sessionId: string): void {
        this.ongoingRoutingSessions.delete(sessionId)
    }

    public stop(): void {
        this.stopped = false
        this.ongoingRoutingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.forwardingTable.forEach((entry) => {
            clearTimeout(entry.timeout)
        })
        this.forwardingTable.clear()
    }
    
    // IRoutingService method
    async routeMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'routeMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Peer ${this.config.ownPeerId?.value} routing message ${routedMessage.requestId} 
                from ${routedMessage.sourcePeer!.kademliaId} to ${routedMessage.destinationPeer!.kademliaId} is likely a duplicate`)
            return createRouteMessageAck(routedMessage, 'message given to routeMessage() service is likely a duplicate')
        }
        logger.trace(`Processing received routeMessage ${routedMessage.requestId}`)
        this.config.addContact(routedMessage.sourcePeer!, true)
        this.addToDuplicateDetector(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)
        if (this.config.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.destinationPeer!))) {
            logger.trace(`${this.config.ownPeerDescriptor.nodeName} routing message targeted to self ${routedMessage.requestId}`)
            this.setForwardingEntries(routedMessage)
            this.config.connectionManager?.handleMessage(routedMessage.message!)
            return createRouteMessageAck(routedMessage)
        } else {
            return this.doRouteMessage(routedMessage)
        }
    }

    private setForwardingEntries(routedMessage: RouteMessageWrapper): void {
        if (routedMessage.reachableThrough.length > 0) {
            const sourceKey = keyFromPeerDescriptor(routedMessage.sourcePeer!)
            if (this.forwardingTable.has(sourceKey)) {
                const oldEntry = this.forwardingTable.get(sourceKey)
                clearTimeout(oldEntry!.timeout)
                this.forwardingTable.delete(sourceKey)
            }
            const forwardingEntry: ForwardingTableEntry = {
                peerDescriptors: routedMessage.reachableThrough,
                timeout: setTimeout(() => {
                    this.forwardingTable.delete(sourceKey)
                }, 10000)
            }
            this.forwardingTable.set(sourceKey, forwardingEntry)
        }
    }

    // IRoutingService method
    async forwardMessage(forwardMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(forwardMessage, 'forwardMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(forwardMessage.requestId)) {
            logger.trace(`Peer ${this.config.ownPeerId.value} forwarding message ${forwardMessage.requestId} 
        from ${forwardMessage.sourcePeer?.kademliaId} to ${forwardMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return createRouteMessageAck(forwardMessage, 'message given to forwardMessage() service is likely a duplicate')
        }
        logger.trace(`Processing received forward routeMessage ${forwardMessage.requestId}`)
        this.config.addContact(forwardMessage.sourcePeer!, true)
        this.addToDuplicateDetector(forwardMessage.requestId, forwardMessage.sourcePeer!.nodeName!)
        if (this.config.ownPeerId.equals(peerIdFromPeerDescriptor(forwardMessage.destinationPeer!))) {
            return this.forwardToDestination(forwardMessage)
        } else {
            return this.doRouteMessage(forwardMessage, RoutingMode.FORWARD)
        }
    }

    private forwardToDestination(routedMessage: RouteMessageWrapper): RouteMessageAck {
        logger.trace(`Peer ${this.config.ownPeerId.value} forwarding found message targeted to self ${routedMessage.requestId}`)
        const forwardedMessage = routedMessage.message!
        if (this.config.ownPeerId!.equals(peerIdFromPeerDescriptor(forwardedMessage.targetDescriptor!))) {
            this.config.connectionManager?.handleMessage(forwardedMessage!)
            return createRouteMessageAck(routedMessage)
        }
        return this.doRouteMessage({ ...routedMessage, destinationPeer: forwardedMessage.targetDescriptor })
    }

}
