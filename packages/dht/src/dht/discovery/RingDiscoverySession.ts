import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { PeerManager } from '../PeerManager'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { RingId, RingIdRaw, getLeftDistance, getRingIdFromPeerDescriptor, getRingIdFromRaw } from '../contact/ringIdentifiers'
import { RingContacts } from '../contact/RingContactList'

const logger = new Logger(module)

interface RingDiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface RingDiscoverySessionConfig {
    targetId: RingIdRaw
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    // Note that contacted peers will be mutated by the DiscoverySession or other parallel sessions
    contactedPeers: Set<DhtAddress>
}

export class RingDiscoverySession {

    public readonly id = v4()
    private stopped = false
    private emitter = new EventEmitter<RingDiscoverySessionEvents>()
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<DhtAddress> = new Set()
    private readonly config: RingDiscoverySessionConfig
    private numContactedPeers = 0
    private targetIdAsRingId: RingId

    constructor(config: RingDiscoverySessionConfig) {
        this.config = config
        this.targetIdAsRingId = getRingIdFromRaw(this.config.targetId)
    }

    private addContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        for (const contact of contacts) {
            this.config.peerManager.addContact(contact)
        }
    }

    private async getClosestPeersFromContact(contact: DhtNodeRpcRemote): Promise<RingContacts> {
        if (this.stopped) {
            return { left: [], right: [] }
        }
        logger.trace(`Getting closest ring peers from contact: ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.numContactedPeers++
        this.config.contactedPeers.add(contact.getNodeId())
        const returnedContacts = await contact.getClosestRingPeers(this.config.targetId)
        this.config.peerManager.setContactActive(contact.getNodeId())
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(nodeId: DhtAddress, contacts: RingContacts) {
        if (!this.ongoingClosestPeersRequests.has(nodeId)) {
            return
        }
        this.ongoingClosestPeersRequests.delete(nodeId)
        const oldClosestContacts = this.config.peerManager.getClosestRingContactsTo(this.config.targetId, 1)
        const oldClosestLeftDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(oldClosestContacts.left[0].getPeerDescriptor())
        )
        const oldClosestRightDistance = getLeftDistance(
            this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(oldClosestContacts.right[0].getPeerDescriptor())
        )
        this.addContacts(contacts.left.concat(contacts.right))
        const newClosestContacts = this.config.peerManager.getClosestRingContactsTo(this.config.targetId, 1)
        const newClosestLeftDistance = getLeftDistance(this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(newClosestContacts.left[0].getPeerDescriptor()))
        const newClosestRightDistance = getLeftDistance(this.targetIdAsRingId,
            getRingIdFromPeerDescriptor(newClosestContacts.right[0].getPeerDescriptor()))
        if (newClosestLeftDistance >= oldClosestLeftDistance && newClosestRightDistance >= oldClosestRightDistance) {
            this.noProgressCounter++
        }
    }

    private onClosestPeersRequestFailed(peer: DhtNodeRpcRemote) {
        if (!this.ongoingClosestPeersRequests.has(peer.getNodeId())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peer.getNodeId())
        this.config.peerManager.removeContact(peer.getNodeId())
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = this.config.peerManager.getClosestRingContactsTo(
            this.config.targetId,
            this.config.parallelism,
            this.config.contactedPeers
        )
        if ((uncontacted.left.length === 0 && uncontacted.right.length === 0)
            || this.noProgressCounter >= this.config.noProgressLimit) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
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
            if (this.ongoingClosestPeersRequests.size >= this.config.parallelism) {
                break
            }
            this.ongoingClosestPeersRequests.add(nextPeer.getNodeId())
            // eslint-disable-next-line promise/catch-or-return
            this.getClosestPeersFromContact(nextPeer)
                .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer.getNodeId(), contacts))
                .catch(() => this.onClosestPeersRequestFailed(nextPeer))
                .finally(() => {
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<void> {
        if (this.config.peerManager.getContactCount(this.config.contactedPeers) === 0) {
            return
        }
        // TODO add abortController and signal it in stop()
        await runAndWaitForEvents3<RingDiscoverySessionEvents>(
            [this.findMoreContacts.bind(this)],
            [[this.emitter, 'discoveryCompleted']],
            timeout
        )
    }

    public stop(): void {
        this.stopped = true
        this.emitter.emit('discoveryCompleted')
        this.emitter.removeAllListeners()
    }
}
