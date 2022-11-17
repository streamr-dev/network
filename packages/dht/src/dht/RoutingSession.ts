import { PeerDescriptor } from "../exports"
import { DhtPeer } from "./DhtPeer"
import { SortedContactList } from "./contact/SortedContactList"
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { Logger } from "@streamr/utils"
import EventEmitter from 'eventemitter3'
import { v4 } from "uuid"
import { RouteMessageWrapper } from "../proto/DhtRpc"

const logger = new Logger(module)

export interface RoutingSessionEvents {
    // These events are emitted based on
    // checking whether there are suitable connected
    // peers to route the message to. The routeMessage RPC
    // server implementation should return success or error ack
    // based on these events.

    noCandidatesFound: (sessionId: string) => void
    candidatesFound: (sessionId: string) => void

    // This event is emitted when a peer responds with a success ack
    // to routeMessage call
    routingSucceeded: (sessionId: string) => void

    // This event is emitted when all the candidates have been gone
    // through, and none of them responds with a success ack

    routingFailed: (sessionId: string) => void
}

export class RoutingSession extends EventEmitter<RoutingSessionEvents> {
    public readonly sessionId = v4()
    private ongoingRequests: Set<PeerIDKey> = new Set()
    private contactList: SortedContactList<DhtPeer>
    private stopped = false

    constructor(
        private ownPeerDescriptor: PeerDescriptor,
        private messageToRoute: RouteMessageWrapper,
        private connections: Map<PeerIDKey, DhtPeer>,
        private parallelism: number,
        private firstHopTimeout: number,
        private forwarding = false
    ) {
        super()
        this.contactList = new SortedContactList(PeerID.fromValue(this.messageToRoute!.destinationPeer!.kademliaId),
            10000, undefined, true, this.messageToRoute!.previousPeer ? PeerID.fromValue(this.messageToRoute!.previousPeer!.kademliaId) : undefined)
    }

    private onRequestFailed(peerId: PeerID) {
        if (this.stopped) {
            return
        }
        if (this.ongoingRequests.has(peerId.toKey())) {
            this.ongoingRequests.delete(peerId.toKey())
        }

        const contacts = this.findMoreContacts()

        if (contacts.length < 1 && this.ongoingRequests.size < 1) {
            this.stopped = true
            this.emit('routingFailed', this.sessionId)
        } else {
            this.sendMoreRequests(contacts)
        }
    }

    private onRequestSucceeded(_peerId: PeerID) {
        if (this.stopped) {
            return
        }
        this.stopped = true
        this.emit('routingSucceeded', this.sessionId)
    }

    private async sendRouteMessageRequest(contact: DhtPeer): Promise<boolean> {
        logger.trace(`Sending routeMessage request from ${this.ownPeerDescriptor.kademliaId} to contact: ${contact.peerId}`)
        this.contactList.setContacted(contact.peerId)
        this.ongoingRequests.add(contact.peerId.toKey())

        if (this.forwarding) {
            return contact.forwardMessage({
                ...this.messageToRoute,
                previousPeer: this.ownPeerDescriptor
            })
        }
        return contact.routeMessage({
            ...this.messageToRoute,
            previousPeer: this.ownPeerDescriptor
        })
    }

    private findMoreContacts(): DhtPeer[] {
        // the contents of the connections might have changed between the rounds
        // addContacts() will only add new contacts that were not there yet
        this.contactList.addContacts([...this.connections.values()])

        return this.contactList.getUncontactedContacts(this.parallelism)
    }

    private sendMoreRequests(uncontacted: DhtPeer[]) {
        if (uncontacted.length < 1) {
            this.emit('routingFailed', this.sessionId)
            return
        }

        while (this.ongoingRequests.size < this.parallelism && uncontacted.length > 0) {
            const nextPeer = uncontacted.shift()
            this.sendRouteMessageRequest(nextPeer!)
                .then((succeeded) => {
                    if (succeeded) {
                        this.onRequestSucceeded(nextPeer!.peerId)
                    } else {
                        this.onRequestFailed(nextPeer!.peerId)
                    }
                    return nextPeer
                }).catch((_e) => { })
        }
    }

    public start(): void {
        const contacts = this.findMoreContacts()
        if (contacts.length < 1) {
            this.emit('noCandidatesFound', this.sessionId)
        } else {
            this.emit('candidatesFound', this.sessionId)
        }
        this.sendMoreRequests(contacts)
    }

    public stop(): void {
        this.stopped = true
    }

}
