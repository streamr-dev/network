import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { PeerManager, getDistance } from '../PeerManager'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { DhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../identifiers'
import { getClosestContacts } from '../contact/getClosestContacts'

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
    private ongoingRequests: Set<DhtAddress> = new Set()
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

    private async fetchClosestNeighborsFromRemote(contact: DhtNodeRpcRemote): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest neighbors from remote: ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.config.contactedPeers.add(contact.getNodeId())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.peerManager.setContactActive(contact.getNodeId())
        return returnedContacts
    }

    private onRequestSucceeded(nodeId: DhtAddress, contacts: PeerDescriptor[]) {
        if (!this.ongoingRequests.has(nodeId)) {
            return
        }
        this.ongoingRequests.delete(nodeId)
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

    private onRequestFailed(peer: DhtNodeRpcRemote) {
        if (!this.ongoingRequests.has(peer.getNodeId())) {
            return
        }
        this.ongoingRequests.delete(peer.getNodeId())
        this.config.peerManager.removeContact(peer.getNodeId())
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = getClosestContacts(
            this.config.targetId,
            this.config.peerManager.getClosestContacts().getAllContactsInUndefinedOrder(),
            {
                maxCount: this.config.parallelism,
                excludedNodeIds: this.config.contactedPeers
            }
        )
        if ((uncontacted.length === 0 && this.ongoingRequests.size === 0) || (this.noProgressCounter >= this.config.noProgressLimit)) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
            return
        }
        for (const nextPeer of uncontacted) {
            if (this.ongoingRequests.size >= this.config.parallelism) {
                break
            }
            this.ongoingRequests.add(nextPeer.getNodeId())
            // eslint-disable-next-line promise/catch-or-return
            this.fetchClosestNeighborsFromRemote(nextPeer)
                .then((contacts) => this.onRequestSucceeded(nextPeer.getNodeId(), contacts))
                .catch(() => this.onRequestFailed(nextPeer))
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
