import { Gate, Logger, withTimeout } from '@streamr/utils'
import { v4 } from 'uuid'
import { DhtAddress, toNodeId } from '../../identifiers'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { PeerManager } from '../PeerManager'
import { RingContacts } from '../contact/RingContactList'
import {
    RingId,
    RingIdRaw,
    getLeftDistance,
    getRingIdFromPeerDescriptor,
    getRingIdFromRaw
} from '../contact/ringIdentifiers'

const logger = new Logger(module)

interface RingDiscoverySessionOptions {
    targetId: RingIdRaw
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    // Note that contacted peers will be mutated by the DiscoverySession or other parallel sessions
    contactedPeers: Set<DhtAddress>
    abortSignal: AbortSignal
}

export class RingDiscoverySession {
    public readonly id = v4()
    private noProgressCounter = 0
    private ongoingRequests: Set<DhtAddress> = new Set()
    private doneGate = new Gate(false)
    private readonly options: RingDiscoverySessionOptions
    private numContactedPeers = 0
    private targetIdAsRingId: RingId

    constructor(options: RingDiscoverySessionOptions) {
        this.options = options
        this.targetIdAsRingId = getRingIdFromRaw(this.options.targetId)
    }

    private addContacts(contacts: PeerDescriptor[]): void {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        for (const contact of contacts) {
            this.options.peerManager.addContact(contact)
        }
    }

    private async fetchClosestContactsFromRemote(contact: DhtNodeRpcRemote): Promise<RingContacts> {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return { left: [], right: [] }
        }
        logger.trace(`Getting closest ring peers from contact: ${toNodeId(contact.getPeerDescriptor())}`)
        this.numContactedPeers++
        this.options.contactedPeers.add(contact.getNodeId())
        const returnedContacts = await contact.getClosestRingPeers(this.options.targetId)
        this.options.peerManager.setContactActive(contact.getNodeId())
        return returnedContacts
    }

    private onRequestSucceeded(nodeId: DhtAddress, contacts: RingContacts) {
        if (!this.ongoingRequests.has(nodeId)) {
            return
        }
        this.ongoingRequests.delete(nodeId)
        const oldClosestContacts = this.options.peerManager.getClosestRingContactsTo(this.options.targetId, 1)
        const oldClosestLeftDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(oldClosestContacts.left[0].getPeerDescriptor())
        )
        const oldClosestRightDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(oldClosestContacts.right[0].getPeerDescriptor())
        )
        this.addContacts(contacts.left.concat(contacts.right))
        const newClosestContacts = this.options.peerManager.getClosestRingContactsTo(this.options.targetId, 1)
        const newClosestLeftDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(newClosestContacts.left[0].getPeerDescriptor())
        )
        const newClosestRightDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(newClosestContacts.right[0].getPeerDescriptor())
        )
        if (newClosestLeftDistance >= oldClosestLeftDistance && newClosestRightDistance >= oldClosestRightDistance) {
            this.noProgressCounter++
        }
    }

    private onRequestFailed(peer: DhtNodeRpcRemote) {
        if (!this.ongoingRequests.has(peer.getNodeId())) {
            return
        }
        this.ongoingRequests.delete(peer.getNodeId())
        this.options.peerManager.removeContact(peer.getNodeId())
    }

    private findMoreContacts(): void {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        const uncontacted = this.options.peerManager.getClosestRingContactsTo(
            this.options.targetId,
            this.options.parallelism,
            this.options.contactedPeers
        )
        if (
            (uncontacted.left.length === 0 && uncontacted.right.length === 0) ||
            this.noProgressCounter >= this.options.noProgressLimit
        ) {
            this.doneGate.open()
            return
        }
        // ask from both sides equally
        const merged = []
        const alreadyInMerged: Set<DhtAddress> = new Set()
        const length = Math.max(uncontacted.left.length, uncontacted.right.length)
        for (let i = 0; i < length; i++) {
            if (i < uncontacted.left.length) {
                if (!alreadyInMerged.has(uncontacted.left[i].getNodeId())) {
                    merged.push(uncontacted.left[i])
                    alreadyInMerged.add(uncontacted.left[i].getNodeId())
                }
            }
            if (i < uncontacted.right.length) {
                if (!alreadyInMerged.has(uncontacted.right[i].getNodeId())) {
                    merged.push(uncontacted.right[i])
                    alreadyInMerged.add(uncontacted.right[i].getNodeId())
                }
            }
        }

        for (const nextPeer of merged) {
            if (this.ongoingRequests.size >= this.options.parallelism) {
                break
            }
            this.ongoingRequests.add(nextPeer.getNodeId())
            // eslint-disable-next-line promise/catch-or-return
            this.fetchClosestContactsFromRemote(nextPeer)
                .then((contacts) => this.onRequestSucceeded(nextPeer.getNodeId(), contacts))
                .catch(() => this.onRequestFailed(nextPeer))
                .finally(() => {
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<void> {
        if (this.options.peerManager.getNearbyContactCount(this.options.contactedPeers) === 0) {
            return
        }
        setImmediate(() => {
            this.findMoreContacts()
        })
        await withTimeout(
            this.doneGate.waitUntilOpen(),
            timeout,
            'discovery session timed out',
            this.options.abortSignal
        )
    }
}
