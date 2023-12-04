import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { PeerManager, getDistance } from '../PeerManager'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface DiscoverySessionConfig {
    targetId: Uint8Array
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    contactedPeers: Set<PeerIDKey>
}

export class DiscoverySession {
    public readonly sessionId = v4()

    private stopped = false
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private outgoingClosestPeersRequestsCounter = 0
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly config: DiscoverySessionConfig

    constructor(config: DiscoverySessionConfig) {
        this.config = config
    }

    private addNewContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        this.config.peerManager.handleNewPeers(contacts)
    }

    private async getClosestPeersFromContact(contact: DhtNodeRpcRemote): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.outgoingClosestPeersRequestsCounter++
        this.config.contactedPeers.add(contact.getPeerId().toKey())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.peerManager.handlePeerActive(contact.getPeerId())
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (!this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peerId.toKey())
        const oldClosestNeighbor = this.config.peerManager.getClosestNeighborsTo(this.config.targetId, 1)[0]
        const oldClosestDistance = getDistance(this.config.targetId, oldClosestNeighbor.getPeerId().value)
        this.addNewContacts(contacts)
        const newClosestNeighbor = this.config.peerManager.getClosestNeighborsTo(this.config.targetId, 1)[0]
        const newClosestDistance = getDistance(this.config.targetId, newClosestNeighbor.getPeerId().value)
        if (newClosestDistance >= oldClosestDistance) {
            this.noProgressCounter++
        } else {
            this.noProgressCounter = 0
        }
    }

    private onClosestPeersRequestFailed(peer: DhtNodeRpcRemote) {
        if (!this.ongoingClosestPeersRequests.has(peer.getPeerId().toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peer.getPeerId().toKey())
        this.config.peerManager.handlePeerUnresponsive(peer.getPeerId())
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = this.config.peerManager.getClosestContactsTo(this.config.targetId, this.config.parallelism, this.config.contactedPeers)
        if (uncontacted.length === 0 || this.noProgressCounter >= this.config.noProgressLimit) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
            return
        }
        for (const nextPeer of uncontacted) {
            if (this.ongoingClosestPeersRequests.size >= this.config.parallelism) {
                break
            }
            this.ongoingClosestPeersRequests.add(nextPeer.getPeerId().toKey())
            // eslint-disable-next-line promise/catch-or-return
            this.getClosestPeersFromContact(nextPeer)
                .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer.getPeerId(), contacts))
                .catch(() => this.onClosestPeersRequestFailed(nextPeer))
                .finally(() => {
                    this.outgoingClosestPeersRequestsCounter--
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<void> {
        if (this.config.peerManager.getNumberOfContacts(this.config.contactedPeers) === 0) {
            return
        }
        // TODO add abortController and signal it in stop()
        await runAndWaitForEvents3<DiscoverySessionEvents>(
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
