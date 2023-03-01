import { Message, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from './RoutingSession'
import { Logger, raceEvents3, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { SetDuplicateDetector } from './SetDuplicateDetector'
import { ConnectionManager } from '../connection/ConnectionManager'
import { DhtPeer } from './DhtPeer'
import { v4 } from 'uuid'

export const createRouteMessageAck = (routedMessage: RouteMessageWrapper, error?: string): RouteMessageAck => {
    const ack: RouteMessageAck = {
        requestId: routedMessage.requestId,
        destinationPeer: routedMessage.sourcePeer,
        sourcePeer: routedMessage.destinationPeer,
        error: error ? error : ''
    }
    return ack
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

export class Router {
    private readonly config: RouterConfig
    private readonly forwardingTable: Map<string, ForwardingTableEntry> = new Map()
    private ongoingRoutingSessions: Map<string, RoutingSession> = new Map()
    private readonly routerDuplicateDetector: SetDuplicateDetector = new SetDuplicateDetector(100000, 100)
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
            this.doRouteMessage(forwardedMessage, true).catch((err) => {
                logger.warn(
                    `Failed to send (forwardMessage: ${this.config.serviceId}) to ${keyFromPeerDescriptor(targetPeerDescriptor)}: ${err}`
                )
            })
        } else {
            const routedMessage: RouteMessageWrapper = {
                message: msg,
                requestId: v4(),
                destinationPeer: targetPeerDescriptor,
                sourcePeer: this.config.ownPeerDescriptor!,
                reachableThrough,
                routingPath: []
            }
            this.doRouteMessage(routedMessage).catch((err) => {
                logger.warn(
                    `Failed to send (routeMessage: ${this.config.serviceId}) to ${keyFromPeerDescriptor(targetPeerDescriptor)}: ${err}`
                )
            })
        }
    }

    public async doRouteMessage(routedMessage: RouteMessageWrapper, forwarding = false): Promise<RouteMessageAck> {
        logger.trace(`Peer ${this.config.ownPeerId.value} routing message ${routedMessage.requestId} 
            from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId}`)
        routedMessage.routingPath.push(this.config.ownPeerDescriptor!)
        const session = new RoutingSession(
            this.config.ownPeerDescriptor!,
            routedMessage,
            this.config.connections,
            this.config.ownPeerId!.equals(peerIdFromPeerDescriptor(routedMessage.sourcePeer!)) ? 2 : 1,
            this.config.routeMessageTimeout,
            forwarding ? RoutingMode.FORWARD : RoutingMode.ROUTE,
            undefined,
            routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        )
        this.addRoutingSession(session)
        let result: RunAndRaceEventsReturnType<RoutingSessionEvents>
        try {
            result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
                session.start()
            }], session, ['noCandidatesFound', 'candidatesFound'], 1000)
        } catch (e) {
            logger.error(e)
            throw e
        }
        // eslint-disable-next-line promise/catch-or-return
        raceEvents3<RoutingSessionEvents>(session, ['routingSucceeded', 'routingFailed', 'stopped'], 10000)
            .then(() => this.removeRoutingSession(session.sessionId))
            .catch(() => this.removeRoutingSession(session.sessionId))
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        } else if (result.winnerName === 'noCandidatesFound' || result.winnerName === 'routingFailed') {
            if (peerIdFromPeerDescriptor(routedMessage.sourcePeer!).equals(this.config.ownPeerId!)) {
                throw new Error(`Could not perform initial routing`)
            }
            return createRouteMessageAck(routedMessage, 'No routing candidates found')
        } else {
            return createRouteMessageAck(routedMessage)
        }
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
    
    // IDhtRpcService method
    private async routeMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
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
            if (this.config.connectionManager) {
                this.config.connectionManager.handleMessage(routedMessage.message!)
            }
            return createRouteMessageAck(routedMessage)
        } else {
            return this.doRouteMessage(routedMessage)
        }
    }

    // IDhtRpcService method
    private async forwardMessage(routedMessage: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'forwardMessage() service is not running')
        } else if (this.routerDuplicateDetector.isMostLikelyDuplicate(routedMessage.requestId)) {
            logger.trace(`Peer ${this.config.ownPeerId.value} forwarding message ${routedMessage.requestId} 
        from ${routedMessage.sourcePeer?.kademliaId} to ${routedMessage.destinationPeer?.kademliaId} is likely a duplicate`)
            return createRouteMessageAck(routedMessage, 'message given to forwardMessage() service is likely a duplicate')
        }
        logger.trace(`Processing received forward routeMessage ${routedMessage.requestId}`)
        this.config.addContact(routedMessage.sourcePeer!, true)
        this.addToDuplicateDetector(routedMessage.requestId, routedMessage.sourcePeer!.nodeName!)
        if (this.config.ownPeerId.equals(peerIdFromPeerDescriptor(routedMessage.destinationPeer!))) {
            logger.trace(`Peer ${this.config.ownPeerId.value} forwarding found message targeted to self ${routedMessage.requestId}`)
            try {
                const forwardedMessage = routedMessage.message!
                if (this.config.ownPeerId!.equals(peerIdFromPeerDescriptor(forwardedMessage.targetDescriptor!))) {
                    if (this.config.connectionManager) {
                        this.config.connectionManager.handleMessage(forwardedMessage!)
                    }
                    return createRouteMessageAck(routedMessage)
                }
                // eslint-disable-next-line promise/catch-or-return
                this.doRouteMessage({ ...routedMessage, destinationPeer: forwardedMessage.targetDescriptor })
                    .catch((err) => {
                        logger.error(
                            `Failed to send (forwardMessage: ${this.config.serviceId}) to`
                            + ` ${keyFromPeerDescriptor(forwardedMessage.targetDescriptor!)}: ${err}`
                        )
                    })
                return createRouteMessageAck(routedMessage)
            } catch (err) {
                logger.trace(`Could not forward message`)
                return createRouteMessageAck(routedMessage, `could not route forwarded message ${routedMessage.requestId}`)
            }
        } else {
            return this.doRouteMessage(routedMessage, true)
        }
    }

}
