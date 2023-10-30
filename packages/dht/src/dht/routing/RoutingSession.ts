import { RemoteDhtNode } from '../RemoteDhtNode'
import { SortedContactList } from '../contact/SortedContactList'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor, RouteMessageWrapper } from '../../proto/packages/dht/protos/DhtRpc'
import { RemoteRouter } from './RemoteRouter'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RoutingServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Contact } from '../contact/Contact'

const logger = new Logger(module)

const MAX_FAILED_HOPS = 2

class RemoteContact extends Contact {

    private router: RemoteRouter

    constructor(peer: RemoteDhtNode, ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RoutingRpcCommunicator) {
        super(peer.getPeerDescriptor())
        this.router = new RemoteRouter(
            ownPeerDescriptor,
            peer.getPeerDescriptor(),
            peer.getServiceId(),
            toProtoRpcClient(new RoutingServiceClient(rpcCommunicator.getRpcClientTransport()))
        )
    }

    getRouter(): RemoteRouter {
        return this.router
    }
}

export interface RoutingSessionEvents {
    // This event is emitted when a peer responds with a success ack
    // to routeMessage call
    routingSucceeded: (sessionId: string) => void
    partialSuccess: (sessionId: string) => void

    // This event is emitted when all the candidates have been gone
    // through, and none of them responds with a success ack
    routingFailed: (sessionId: string) => void
    stopped: (sessionId: string) => void
    noCandidatesFound: (sessionId: string) => void
}

export enum RoutingMode { ROUTE, FORWARD, RECURSIVE_FIND }

export class RoutingSession extends EventEmitter<RoutingSessionEvents> {

    public readonly sessionId = v4()
    private readonly rpcCommunicator: RoutingRpcCommunicator
    private ongoingRequests: Set<PeerIDKey> = new Set()
    private contactList: SortedContactList<RemoteContact>
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly messageToRoute: RouteMessageWrapper
    private connections: Map<PeerIDKey, RemoteDhtNode>
    private readonly parallelism: number
    private failedHopCounter = 0
    private successfulHopCounter = 0
    private readonly mode: RoutingMode = RoutingMode.ROUTE
    private stopped = false

    constructor(
        rpcCommunicator: RoutingRpcCommunicator,
        ownPeerDescriptor: PeerDescriptor,
        messageToRoute: RouteMessageWrapper,
        connections: Map<PeerIDKey, RemoteDhtNode>,
        parallelism: number,
        mode: RoutingMode = RoutingMode.ROUTE,
        destinationId?: Uint8Array,
        excludedPeerIDs?: PeerID[]
    ) {
        super()
        this.rpcCommunicator = rpcCommunicator
        this.ownPeerDescriptor = ownPeerDescriptor
        this.messageToRoute = messageToRoute
        this.connections = connections
        this.parallelism = parallelism
        this.mode = mode
        const previousId = messageToRoute.previousPeer ? PeerID.fromValue(messageToRoute.previousPeer.kademliaId) : undefined
        this.contactList = new SortedContactList(
            destinationId ? PeerID.fromValue(destinationId) : PeerID.fromValue(this.messageToRoute.destinationPeer!.kademliaId),
            10000,
            undefined,
            true,
            previousId,
            excludedPeerIDs
        )
    }

    private onRequestFailed = (peerId: PeerID) => {
        logger.trace('onRequestFailed() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        if (this.ongoingRequests.has(peerId.toKey())) {
            this.ongoingRequests.delete(peerId.toKey())
        }
        const contacts = this.findMoreContacts()
        if (contacts.length < 1 && this.ongoingRequests.size < 1) {
            logger.trace('routing failed, emitting routingFailed sessionId: ' + this.sessionId)
            this.stopped = true
            this.emitFailure()
        } else {
            this.failedHopCounter += 1
            logger.trace('routing failed, retrying to route sessionId: ' + this.sessionId + ' failedHopCounter: ' + this.failedHopCounter)
            this.sendMoreRequests(contacts)
        }
    }

    private emitFailure = () => {
        if (this.successfulHopCounter >= 1) {
            this.emit('partialSuccess', this.sessionId)

        } else {
            this.emit('routingFailed', this.sessionId)
        }
    }

    private onRequestSucceeded = () => {
        logger.trace('onRequestSucceeded() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        this.successfulHopCounter += 1
        const contacts = this.findMoreContacts()
        if (this.successfulHopCounter >= this.parallelism || contacts.length < 1) {
            this.stopped = true
            this.emit('routingSucceeded', this.sessionId)
        } else if (contacts.length > 0 && this.ongoingRequests.size < 1) {
            this.sendMoreRequests(contacts)
        }
    }

    private sendRouteMessageRequest = async (contact: RemoteContact): Promise<boolean> => {
        if (this.stopped) {
            return false
        }
        const router = contact.getRouter()
        if (this.mode === RoutingMode.FORWARD) {
            return router.forwardMessage({
                ...this.messageToRoute,
                previousPeer: this.ownPeerDescriptor
            })
        } else if (this.mode === RoutingMode.RECURSIVE_FIND) {
            return router.findRecursively({
                ...this.messageToRoute,
                previousPeer: this.ownPeerDescriptor
            })
        } else {
            return router.routeMessage({
                ...this.messageToRoute,
                previousPeer: this.ownPeerDescriptor
            })
        }
    }

    private findMoreContacts = (): RemoteContact[] => {
        logger.trace('findMoreContacts() sessionId: ' + this.sessionId)
        // the contents of the connections might have changed between the rounds
        // addContacts() will only add new contacts that were not there yet
        const contacts = Array.from(this.connections.values())
            .map((peer) => new RemoteContact(peer, this.ownPeerDescriptor, this.rpcCommunicator))
        this.contactList.addContacts(contacts)
        return this.contactList.getUncontactedContacts(this.parallelism)
    }

    private sendMoreRequests = (uncontacted: RemoteContact[]) => {
        logger.trace('sendMoreRequests() sessionId: ' + this.sessionId)
        if (this.stopped) {
            return
        }
        if (uncontacted.length < 1) {
            this.emitFailure()
            return
        }
        if (this.failedHopCounter >= MAX_FAILED_HOPS) {
            logger.trace(`Stopping routing after ${MAX_FAILED_HOPS} failed attempts for sessionId: ${this.sessionId}`)
            this.emitFailure()
            return
        }
        while ((this.ongoingRequests.size) < this.parallelism && (uncontacted.length > 0) && !this.stopped) {
            const nextPeer = uncontacted.shift()
            // eslint-disable-next-line max-len
            logger.trace(`Sending routeMessage request to contact: ${keyFromPeerDescriptor(nextPeer!.getPeerDescriptor())} (sessionId=${this.sessionId})`)
            this.contactList.setContacted(nextPeer!.getPeerId())
            this.ongoingRequests.add(nextPeer!.getPeerId().toKey())
            setImmediate(async () => {
                try {
                    const succeeded = await this.sendRouteMessageRequest(nextPeer!)
                    if (succeeded) {
                        this.onRequestSucceeded()
                    } else {
                        this.onRequestFailed(nextPeer!.getPeerId())
                    }
                } catch (e) {
                    logger.debug('Unable to route message ', { error: e })
                } finally {
                    logger.trace('sendRouteMessageRequest returned')
                }
            })
        }
    }

    public start(): void {
        logger.trace('start() sessionId: ' + this.sessionId)
        const contacts = this.findMoreContacts()
        if (contacts.length < 1) {
            logger.trace('start() throwing noCandidatesFound sessionId: ' + this.sessionId)
            
            this.stopped = true
            this.emit('noCandidatesFound', this.sessionId)
            throw new Error('noCandidatesFound ' + this.sessionId)
        }
        this.sendMoreRequests(contacts)
    }

    public stop(): void {
        this.stopped = true
        this.contactList.stop()

        this.emit('stopped', this.sessionId)
        this.removeAllListeners()
    }

}
