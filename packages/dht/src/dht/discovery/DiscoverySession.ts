import { Gate, Logger, withTimeout } from '@streamr/utils'
import { v4 } from 'uuid'
import { DhtAddress, toNodeId, toDhtAddressRaw } from '../../identifiers'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { PeerManager, getDistance } from '../PeerManager'
import { getClosestNodes } from '../contact/getClosestNodes'

const logger = new Logger(module)

interface DiscoverySessionOptions {
    targetId: DhtAddress
    parallelism: number
    noProgressLimit: number
    peerManager: PeerManager
    // Note that contacted peers will be mutated by the DiscoverySession or other parallel sessions
    contactedPeers: Set<DhtAddress>
    abortSignal: AbortSignal
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
}

export class DiscoverySession {
    public readonly id = v4()
    private noProgressCounter = 0
    private ongoingRequests: Set<DhtAddress> = new Set()
    private doneGate = new Gate(false)
    private readonly options: DiscoverySessionOptions

    constructor(options: DiscoverySessionOptions) {
        this.options = options
    }

    private addContacts(contacts: PeerDescriptor[]): void {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        for (const contact of contacts) {
            this.options.peerManager.addContact(contact)
        }
    }

    private async fetchClosestNeighborsFromRemote(peerDescriptor: PeerDescriptor): Promise<PeerDescriptor[]> {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return []
        }
        const nodeId = toNodeId(peerDescriptor)
        logger.trace(`Getting closest neighbors from remote: ${nodeId}`)
        this.options.contactedPeers.add(nodeId)
        const remote = this.options.createDhtNodeRpcRemote(peerDescriptor)
        const returnedContacts = await remote.getClosestPeers(this.options.targetId)
        this.options.peerManager.setContactActive(nodeId)
        return returnedContacts
    }

    private onRequestSucceeded(nodeId: DhtAddress, contacts: PeerDescriptor[]) {
        if (!this.ongoingRequests.has(nodeId)) {
            return
        }
        this.ongoingRequests.delete(nodeId)
        const targetId = toDhtAddressRaw(this.options.targetId)
        const oldClosestNeighbor = this.getClosestNeighbor()
        const oldClosestDistance = getDistance(targetId, oldClosestNeighbor.nodeId)
        this.addContacts(contacts)
        const newClosestNeighbor = this.getClosestNeighbor()
        const newClosestDistance = getDistance(targetId, newClosestNeighbor.nodeId)
        if (newClosestDistance >= oldClosestDistance) {
            this.noProgressCounter++
        }
    }

    private getClosestNeighbor(): PeerDescriptor {
        return getClosestNodes(
            this.options.targetId,
            this.options.peerManager.getNeighbors().map((n) => n.getPeerDescriptor()),
            { maxCount: 1 }
        )[0]
    }

    private onRequestFailed(nodeId: DhtAddress) {
        if (!this.ongoingRequests.has(nodeId)) {
            return
        }
        this.ongoingRequests.delete(nodeId)
        this.options.peerManager.removeContact(nodeId)
    }

    private findMoreContacts(): void {
        if (this.options.abortSignal.aborted || this.doneGate.isOpen()) {
            return
        }
        const uncontacted = getClosestNodes(
            this.options.targetId,
            Array.from(this.options.peerManager.getNearbyContacts().getAllContactsInUndefinedOrder(), (c) =>
                c.getPeerDescriptor()
            ),
            {
                maxCount: this.options.parallelism,
                excludedNodeIds: this.options.contactedPeers
            }
        )
        if (
            (uncontacted.length === 0 && this.ongoingRequests.size === 0) ||
            this.noProgressCounter >= this.options.noProgressLimit
        ) {
            this.doneGate.open()
            return
        }
        for (const node of uncontacted) {
            if (this.ongoingRequests.size >= this.options.parallelism) {
                break
            }
            const nodeId = toNodeId(node)
            this.ongoingRequests.add(nodeId)
            // eslint-disable-next-line promise/catch-or-return
            this.fetchClosestNeighborsFromRemote(node)
                .then((contacts) => this.onRequestSucceeded(nodeId, contacts))
                .catch(() => this.onRequestFailed(nodeId))
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
