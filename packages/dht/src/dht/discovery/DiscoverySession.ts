import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { PeerManager, getDistance } from '../PeerManager'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { DhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../identifiers'

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface DiscoverySessionConfig {
    targetId: DhtAddress
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    // Note that contacted peers will be mutated by the DiscoverySession or other parallel sessions
    contactedPeers: Set<DhtAddress>
}

export class DiscoverySession {

    public readonly id = v4()
    private stopped = false
    // TODO could we use a Gate to check if we have completed? 
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<DhtAddress> = new Set()
    private readonly config: DiscoverySessionConfig

    constructor(config: DiscoverySessionConfig) {
        this.config = config
    }

    private addContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        for (const contact of contacts) {
            this.config.peerManager.addContact(contact)
        }
    }

    private async getClosestPeersFromContact(contact: DhtNodeRpcRemote): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.config.contactedPeers.add(contact.getNodeId())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.peerManager.setContactActive(contact.getNodeId())
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(nodeId: DhtAddress, contacts: PeerDescriptor[]) {
        if (!this.ongoingClosestPeersRequests.has(nodeId)) {
            return
        }
        this.ongoingClosestPeersRequests.delete(nodeId)
        const targetId = getRawFromDhtAddress(this.config.targetId)
        const oldClosestNeighbor = this.config.peerManager.getClosestNeighborsTo(this.config.targetId, 1)[0]
        const oldClosestDistance = getDistance(targetId, getRawFromDhtAddress(oldClosestNeighbor.getNodeId()))
        this.addContacts(contacts)
        const newClosestNeighbor = this.config.peerManager.getClosestNeighborsTo(this.config.targetId, 1)[0]
        const newClosestDistance = getDistance(targetId, getRawFromDhtAddress(newClosestNeighbor.getNodeId()))
        if (newClosestDistance >= oldClosestDistance) {
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
        const uncontacted = this.config.peerManager.getClosestContactsTo(
            this.config.targetId,
            this.config.parallelism,
            this.config.contactedPeers
        )
        if (uncontacted.length === 0 || this.noProgressCounter >= this.config.noProgressLimit) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
            return
        }
        for (const nextPeer of uncontacted) {
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
