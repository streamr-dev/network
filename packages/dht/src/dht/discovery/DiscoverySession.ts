import { Gate, Logger, wait } from '@streamr/utils'
import { v4 } from 'uuid'
import { DhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../identifiers'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { PeerManager, getDistance } from '../PeerManager'

const logger = new Logger(module)

interface DiscoverySessionConfig {
    targetId: DhtAddress
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    // Note that contacted peers will be mutated by the DiscoverySession or other parallel sessions
    contactedPeers: Set<DhtAddress>
    abortSignal: AbortSignal
}

export class DiscoverySession {

    public readonly id = v4()
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<DhtAddress> = new Set()
    private doneGate = new Gate(false)
    private readonly config: DiscoverySessionConfig

    constructor(config: DiscoverySessionConfig) {
        this.config = config
    }

    private addContacts(contacts: PeerDescriptor[]): void {
        if (this.config.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        for (const contact of contacts) {
            this.config.peerManager.addContact(contact)
        }
    }

    private async getClosestPeersFromContact(contact: DhtNodeRpcRemote): Promise<PeerDescriptor[]> {
        if (this.config.abortSignal.aborted || this.doneGate.isOpen()) {
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
        if (this.config.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        const uncontacted = this.config.peerManager.getClosestContactsTo(
            this.config.targetId,
            this.config.parallelism,
            this.config.contactedPeers
        )
        if (uncontacted.length === 0 || this.noProgressCounter >= this.config.noProgressLimit) {
            this.doneGate.open()
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

        setImmediate(() => {
            this.findMoreContacts()
        })
        await Promise.race([
            this.doneGate.waitUntilOpen(),
            wait(timeout, this.config.abortSignal)
        ])
    }
}
