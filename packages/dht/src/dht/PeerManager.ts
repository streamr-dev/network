import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import KBucket from 'k-bucket'
import { LockID } from '../connection/ConnectionLockStates'
import { ConnectionLocker } from '../connection/ConnectionManager'
import { DhtAddress, DhtAddressRaw, toNodeId, toDhtAddressRaw } from '../identifiers'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { RandomContactList } from './contact/RandomContactList'
import { RingContactList } from './contact/RingContactList'
import { ReadonlySortedContactList, SortedContactList } from './contact/SortedContactList'
import { RingIdRaw, getRingIdRawFromPeerDescriptor } from './contact/ringIdentifiers'

const logger = new Logger(module)

interface PeerManagerOptions {
    numberOfNodesPerKBucket: number
    maxContactCount: number
    localNodeId: DhtAddress
    localPeerDescriptor: PeerDescriptor
    connectionLocker?: ConnectionLocker
    lockId: LockID
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
    hasConnection: (nodeId: DhtAddress) => boolean
}

// Returns all offline nodes, sets contacts as active if they are online
const pingNodes = async (nodes: DhtNodeRpcRemote[], activeContacts: Set<DhtAddress>): Promise<PeerDescriptor[]> => {
    const offlineNeighbors: PeerDescriptor[] = []
    await Promise.allSettled(
        nodes.map(async (contact) => {
            const isOnline = await contact.ping()
            if (!isOnline) {
                activeContacts.delete(contact.getNodeId())
                offlineNeighbors.push(contact.getPeerDescriptor())
            } else {
                activeContacts.add(contact.getNodeId())
            }
        })
    )
    return offlineNeighbors
}

export interface PeerManagerEvents {
    nearbyContactAdded: (peerDescriptor: PeerDescriptor) => void
    nearbyContactRemoved: (peerDescriptor: PeerDescriptor) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor) => void
    kBucketEmpty: () => void
}

export const getDistance = (nodeIdOrDataKeyRaw1: DhtAddressRaw, nodeIdOrDataKeyRaw2: DhtAddressRaw): number => {
    return KBucket.distance(nodeIdOrDataKeyRaw1, nodeIdOrDataKeyRaw2)
}

export class PeerManager extends EventEmitter<PeerManagerEvents> {
    // Glossary:
    // * 'neighbors' are the nodes that are our neighbors according to
    //   the protocol of the layer we are in
    // * 'connections' are the nodes that are connected to this node on Layer0
    // * 'contacts' are all non-unresponsive nodes that we know about

    private neighbors: KBucket<DhtNodeRpcRemote>
    private nearbyContacts: SortedContactList<DhtNodeRpcRemote>
    private activeContacts: Set<DhtAddress>
    private ringContacts: RingContactList<DhtNodeRpcRemote>
    private randomContacts: RandomContactList<DhtNodeRpcRemote>
    private stopped: boolean = false
    private readonly options: PeerManagerOptions

    constructor(options: PeerManagerOptions) {
        super()
        this.options = options
        this.neighbors = new KBucket<DhtNodeRpcRemote>({
            localNodeId: toDhtAddressRaw(this.options.localNodeId),
            numberOfNodesPerKBucket: this.options.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.options.numberOfNodesPerKBucket
        })
        this.ringContacts = new RingContactList<DhtNodeRpcRemote>(
            getRingIdRawFromPeerDescriptor(this.options.localPeerDescriptor)
        )
        this.ringContacts.on('contactAdded', (contact: DhtNodeRpcRemote) => {
            this.emit('ringContactAdded', contact.getPeerDescriptor())
        })
        this.ringContacts.on('contactRemoved', (contact: DhtNodeRpcRemote) => {
            this.emit('ringContactRemoved', contact.getPeerDescriptor())
        })
        this.neighbors.on('ping', (oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote) =>
            this.onKBucketPing(oldContacts, newContact)
        )
        this.neighbors.on('removed', (contact: DhtNodeRpcRemote) =>
            this.onKBucketRemoved(toNodeId(contact.getPeerDescriptor()))
        )
        this.neighbors.on('added', (contact: DhtNodeRpcRemote) => this.onKBucketAdded(contact))
        this.neighbors.on('updated', () => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.nearbyContacts = new SortedContactList({
            referenceId: this.options.localNodeId,
            maxSize: this.options.maxContactCount,
            allowToContainReferenceId: false
        })
        this.nearbyContacts.on('contactRemoved', (contact: DhtNodeRpcRemote) => {
            if (this.stopped) {
                return
            }
            this.emit('nearbyContactRemoved', contact.getPeerDescriptor())
            this.randomContacts.addContact(this.options.createDhtNodeRpcRemote(contact.getPeerDescriptor()))
        })
        this.nearbyContacts.on('contactAdded', (contact: DhtNodeRpcRemote) =>
            this.emit('nearbyContactAdded', contact.getPeerDescriptor())
        )
        this.activeContacts = new Set()
        this.randomContacts = new RandomContactList(this.options.localNodeId, this.options.maxContactCount)
        this.randomContacts.on('contactRemoved', (removedContact: DhtNodeRpcRemote) =>
            this.emit('randomContactRemoved', removedContact.getPeerDescriptor())
        )
        this.randomContacts.on('contactAdded', (contactAdded: DhtNodeRpcRemote) =>
            this.emit('randomContactAdded', contactAdded.getPeerDescriptor())
        )
    }

    private onKBucketPing(oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtNodeRpcRemote> = new SortedContactList({
            referenceId: this.options.localNodeId,
            allowToContainReferenceId: false
        })
        sortingList.addContacts(oldContacts)
        const removableNodeId = sortingList.getFurthestContacts(1)[0].getNodeId()
        this.options.connectionLocker?.weakUnlockConnection(removableNodeId, this.options.lockId)
        this.neighbors.remove(toDhtAddressRaw(removableNodeId))
        this.neighbors.add(newContact)
    }

    private onKBucketRemoved(nodeId: DhtAddress): void {
        if (this.stopped) {
            return
        }
        this.options.connectionLocker?.weakUnlockConnection(nodeId, this.options.lockId)
        logger.trace(`Removed contact ${nodeId}`)
        if (this.neighbors.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        if (contact.getNodeId() !== this.options.localNodeId) {
            const peerDescriptor = contact.getPeerDescriptor()
            const nodeId = toNodeId(peerDescriptor)
            // Important to lock here, before the ping result is known
            this.options.connectionLocker?.weakLockConnection(nodeId, this.options.lockId)
            if (this.options.hasConnection(contact.getNodeId())) {
                logger.trace(`Added new contact ${nodeId}`)
            } else {
                // open connection by pinging
                logger.trace('starting ping ' + nodeId)
                contact
                    .ping()
                    .then((result) => {
                        if (result) {
                            logger.trace(`Added new contact ${nodeId}`)
                        } else {
                            logger.trace('ping failed ' + nodeId)
                            this.options.connectionLocker?.weakUnlockConnection(nodeId, this.options.lockId)
                            this.removeContact(nodeId)
                            this.addNearbyContactToNeighbors()
                        }
                    })
                    .catch((_e) => {
                        this.options.connectionLocker?.weakUnlockConnection(nodeId, this.options.lockId)
                        this.removeContact(nodeId)
                        this.addNearbyContactToNeighbors()
                    })
            }
        }
    }

    private addNearbyContactToNeighbors(): void {
        if (this.stopped) {
            return
        }
        const closest = this.getNearbyActiveContactNotInNeighbors()
        if (closest) {
            this.addContact(closest.getPeerDescriptor())
        }
    }

    private getNearbyActiveContactNotInNeighbors(): DhtNodeRpcRemote | undefined {
        for (const contactId of this.nearbyContacts.getContactIds()) {
            if (!this.neighbors.get(toDhtAddressRaw(contactId)) && this.activeContacts.has(contactId)) {
                return this.nearbyContacts.getContact(contactId)!
            }
        }
        return undefined
    }

    removeContact(nodeId: DhtAddress): void {
        if (this.stopped) {
            return
        }
        logger.trace(`Removing contact ${nodeId}`)
        this.ringContacts.removeContact(this.nearbyContacts.getContact(nodeId))
        this.neighbors.remove(toDhtAddressRaw(nodeId))
        this.nearbyContacts.removeContact(nodeId)
        this.activeContacts.delete(nodeId)
        this.randomContacts.removeContact(nodeId)
    }

    removeNeighbor(nodeId: DhtAddress): void {
        this.neighbors.remove(toDhtAddressRaw(nodeId))
    }

    async pruneOfflineNodes(nodes: DhtNodeRpcRemote[]): Promise<void> {
        logger.trace('Pruning offline nodes', { nodes: nodes.length })
        const offlineNeighbors = await pingNodes(nodes, this.activeContacts)
        offlineNeighbors.forEach((offlineNeighbor) => {
            logger.trace('Removing offline node', { node: toNodeId(offlineNeighbor) })
            this.removeContact(toNodeId(offlineNeighbor))
        })
    }

    stop(): void {
        this.stopped = true
        this.neighbors.toArray().forEach((rpcRemote: DhtNodeRpcRemote) => {
            rpcRemote.leaveNotice()
            this.neighbors.remove(rpcRemote.id)
        })
        this.neighbors.removeAllListeners()
        this.ringContacts.getAllContacts().forEach((rpcRemote) => {
            rpcRemote.leaveNotice()
            this.ringContacts.removeContact(rpcRemote)
        })
        this.nearbyContacts.stop()
        this.randomContacts.stop()
    }

    getNearbyContacts(): ReadonlySortedContactList<DhtNodeRpcRemote> {
        return this.nearbyContacts
    }

    getClosestRingContactsTo(
        ringIdRaw: RingIdRaw,
        limit?: number,
        excludedIds?: Set<DhtAddress>
    ): { left: DhtNodeRpcRemote[]; right: DhtNodeRpcRemote[] } {
        const closest = new RingContactList<DhtNodeRpcRemote>(ringIdRaw, excludedIds)
        this.ringContacts.getAllContacts().map((contact) => closest.addContact(contact))
        // TODO use options option or named constant?
        return closest.getClosestContacts(limit ?? 8)
    }

    getRandomContacts(): RandomContactList<DhtNodeRpcRemote> {
        return this.randomContacts
    }

    getRingContacts(): RingContactList<DhtNodeRpcRemote> {
        return this.ringContacts
    }

    getNearbyContactCount(excludedNodeIds?: Set<DhtAddress>): number {
        return this.nearbyContacts.getSize(excludedNodeIds)
    }

    getNeighborCount(): number {
        return this.neighbors.count()
    }

    getNeighbors(): readonly DhtNodeRpcRemote[] {
        return this.neighbors.toArray()
    }

    setContactActive(nodeId: DhtAddress): void {
        this.activeContacts.add(nodeId)
    }

    addContact(peerDescriptor: PeerDescriptor): void {
        if (this.stopped) {
            return
        }
        const nodeId = toNodeId(peerDescriptor)
        if (nodeId !== this.options.localNodeId) {
            logger.trace(`Adding new contact ${nodeId}`)
            const remote = this.options.createDhtNodeRpcRemote(peerDescriptor)
            const isInNeighbors = this.neighbors.get(peerDescriptor.nodeId) !== null
            const isInNearbyContacts = this.nearbyContacts.getContact(nodeId) !== undefined
            const isInRingContacts = this.ringContacts.getContact(peerDescriptor) !== undefined

            if (isInNeighbors || isInNearbyContacts) {
                this.randomContacts.addContact(remote)
            }
            if (!isInNeighbors) {
                this.neighbors.add(remote)
            }
            if (!isInNearbyContacts) {
                this.nearbyContacts.addContact(remote)
            }
            if (!isInRingContacts) {
                this.ringContacts.addContact(remote)
            }
        }
    }
}
