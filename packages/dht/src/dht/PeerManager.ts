import {
    Logger
} from '@streamr/utils'
import KBucket from 'k-bucket'
import {
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { RandomContactList } from './contact/RandomContactList'
import { ReadonlySortedContactList, SortedContactList } from './contact/SortedContactList'
import { ConnectionLocker } from '../connection/ConnectionManager'
import EventEmitter from 'eventemitter3'
import { DhtAddress, DhtAddressRaw, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../identifiers'
import { RingContactList, RingContacts } from './contact/RingContactList'
import { RingIdRaw, getRingIdRawFromPeerDescriptor } from './contact/ringIdentifiers'
import { LockID } from '../connection/ConnectionLockStates'

const logger = new Logger(module)

interface PeerManagerConfig {
    numberOfNodesPerKBucket: number
    maxContactListSize: number
    localNodeId: DhtAddress
    localPeerDescriptor: PeerDescriptor
    connectionLocker?: ConnectionLocker
    isLayer0: boolean
    lockId: LockID
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
}

export interface PeerManagerEvents {
    contactAdded: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => void
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
    // Nodes that are connected to this node on Layer0
    public readonly connections: Map<DhtAddress, DhtNodeRpcRemote> = new Map()
    private closestContacts: SortedContactList<DhtNodeRpcRemote>
    private activeContacts: Set<DhtAddress>
    private ringContacts: RingContactList<DhtNodeRpcRemote>
    private randomContacts: RandomContactList<DhtNodeRpcRemote>
    private stopped: boolean = false
    private readonly config: PeerManagerConfig

    constructor(config: PeerManagerConfig) {
        super()
        this.config = config
        this.neighbors = new KBucket<DhtNodeRpcRemote>({
            localNodeId: getRawFromDhtAddress(this.config.localNodeId),
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })
        this.ringContacts = new RingContactList<DhtNodeRpcRemote>(getRingIdRawFromPeerDescriptor(this.config.localPeerDescriptor))
        this.ringContacts.on('ringContactAdded', (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => {
            this.emit('ringContactAdded', peerDescriptor, closestPeers)
        })
        this.ringContacts.on('ringContactRemoved', (peerDescriptor: PeerDescriptor, closestPeers: RingContacts) => {
            this.emit('ringContactRemoved', peerDescriptor, closestPeers)
        })
        this.neighbors.on('ping', (oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote) => this.onKBucketPing(oldContacts, newContact))
        this.neighbors.on('removed', (contact: DhtNodeRpcRemote) => this.onKBucketRemoved(getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())))
        this.neighbors.on('added', (contact: DhtNodeRpcRemote) => this.onKBucketAdded(contact))
        this.neighbors.on('updated', () => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.closestContacts = new SortedContactList({
            referenceId: this.config.localNodeId,
            maxSize: this.config.maxContactListSize,
            allowToContainReferenceId: false
        })
        this.closestContacts.on('contactRemoved', (removedContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', removedContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
            this.randomContacts.addContact(this.config.createDhtNodeRpcRemote(removedContact.getPeerDescriptor()))
        })
        this.closestContacts.on('contactAdded', (contactAdded: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('contactAdded', contactAdded.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
        this.activeContacts = new Set()
        this.randomContacts = new RandomContactList(this.config.localNodeId, this.config.maxContactListSize)
        this.randomContacts.on('contactRemoved', (removedContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('randomContactRemoved', removedContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
        this.randomContacts.on('contactAdded', (contactAdded: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('randomContactAdded', contactAdded.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
    }

    private onKBucketPing(oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtNodeRpcRemote> = new SortedContactList({
            referenceId: this.config.localNodeId,
            maxSize: 100,  // TODO use config option or named constant?
            allowToContainReferenceId: false
        })
        sortingList.addContacts(oldContacts)
        const removableNodeId = sortingList.getFurthestContacts(1)[0].getNodeId()
        this.config.connectionLocker?.weakUnlockConnection(removableNodeId, this.config.lockId)
        this.neighbors.remove(getRawFromDhtAddress(removableNodeId))
        this.neighbors.add(newContact)
    }

    private onKBucketRemoved(nodeId: DhtAddress): void {
        if (this.stopped) {
            return
        }
        this.config.connectionLocker?.weakUnlockConnection(nodeId, this.config.lockId)
        logger.trace(`Removed contact ${nodeId}`)
        if (this.neighbors.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        if (contact.getNodeId() !== this.config.localNodeId) {
            const peerDescriptor = contact.getPeerDescriptor()
            const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
            // Important to lock here, before the ping result is known
            this.config.connectionLocker?.weakLockConnection(nodeId, this.config.lockId)
            if (this.connections.has(contact.getNodeId())) {
                logger.trace(`Added new contact ${nodeId}`)
            } else {    // open connection by pinging
                logger.trace('starting ping ' + nodeId)
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${nodeId}`)
                    } else {
                        logger.trace('ping failed ' + nodeId)
                        this.config.connectionLocker?.weakUnlockConnection(nodeId, this.config.lockId)
                        this.removeContact(nodeId)
                        this.addClosestContactToBucket()
                    }
                }).catch((_e) => {
                    this.config.connectionLocker?.weakUnlockConnection(nodeId, this.config.lockId)
                    this.removeContact(nodeId)
                    this.addClosestContactToBucket()
                })
            }
        }
    }

    private addClosestContactToBucket(): void {
        if (this.stopped) {
            return
        }
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.addContact(closest.getPeerDescriptor())
        }
    }

    private getClosestActiveContactNotInBucket(): DhtNodeRpcRemote | undefined {
        for (const contactId of this.closestContacts.getContactIds()) {
            if (!this.neighbors.get(getRawFromDhtAddress(contactId)) && this.activeContacts.has(contactId)) {
                return this.closestContacts.getContact(contactId)!
            }
        }
        return undefined
    }

    onContactConnected(peerDescriptor: PeerDescriptor): void {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (nodeId === this.config.localNodeId) {
            logger.error('handleConnected() to self')
        }
        const rpcRemote = this.config.createDhtNodeRpcRemote(peerDescriptor)
        if (!this.connections.has(nodeId)) {
            this.connections.set(nodeId, rpcRemote)
            logger.trace('connectionschange add ' + this.connections.size)
        } else {
            logger.trace('new connection not set to connections, there is already a connection with the peer ID')
        }
        logger.trace('connected: ' + nodeId + ' ' + this.connections.size)
    }

    onContactDisconnected(nodeId: DhtAddress, gracefulLeave: boolean): void {
        logger.trace('disconnected: ' + nodeId)
        this.connections.delete(nodeId)
        if (this.config.isLayer0) {
            this.neighbors.remove(getRawFromDhtAddress(nodeId))
            if (gracefulLeave === true) {
                logger.trace(nodeId + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
                this.removeContact(nodeId)
            } else {
                logger.trace(nodeId + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
            }
        }
    }

    removeContact(nodeId: DhtAddress): void {
        if (this.stopped) {
            return
        }
        logger.trace(`Removing contact ${nodeId}`)
        this.ringContacts.removeContact(this.closestContacts.getContact(nodeId))
        this.neighbors.remove(getRawFromDhtAddress(nodeId))
        this.closestContacts.removeContact(nodeId)
        this.activeContacts.delete(nodeId)
        this.randomContacts.removeContact(nodeId)
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
        this.closestContacts.stop()
        this.randomContacts.stop()
        this.connections.clear()
    }

    getClosestNeighborsTo(referenceId: DhtAddress, limit?: number, excludedNodeIds?: Set<DhtAddress>): DhtNodeRpcRemote[] {
        const closest = new SortedContactList<DhtNodeRpcRemote>({
            referenceId,
            allowToContainReferenceId: true,
            excludedNodeIds,
            maxSize: limit
        })
        this.neighbors.toArray().forEach((contact) => closest.addContact(contact))
        return closest.getClosestContacts()
    }

    getClosestContacts(): ReadonlySortedContactList<DhtNodeRpcRemote> {
        return this.closestContacts
    }

    getClosestRingContactsTo(
        ringIdRaw: RingIdRaw,
        limit?: number,
        excludedIds?: Set<DhtAddress>
    ): { left: DhtNodeRpcRemote[], right: DhtNodeRpcRemote[] } {
        const closest = new RingContactList<DhtNodeRpcRemote>(ringIdRaw, excludedIds)
        for (const contact of this.closestContacts.getAllContactsInUndefinedOrder()) {
            closest.addContact(contact)
        }
        this.ringContacts.getAllContacts().map((contact) => closest.addContact(contact))
        return closest.getClosestContacts(limit ?? 8)
    }

    getContactCount(excludedNodeIds?: Set<DhtAddress>): number {
        return this.closestContacts.getSize(excludedNodeIds)
    }

    getConnectionCount(): number {
        return this.connections.size
    }

    getNeighborCount(): number {
        return this.neighbors.count()
    }

    getNeighbors(): PeerDescriptor[] {
        return this.neighbors.toArray().map((rpcRemote: DhtNodeRpcRemote) => rpcRemote.getPeerDescriptor())
    }

    setContactActive(nodeId: DhtAddress): void {
        this.activeContacts.add(nodeId)
    }

    addContact(peerDescriptor: PeerDescriptor): void {
        if (this.stopped) {
            return
        }
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (nodeId !== this.config.localNodeId) {
            logger.trace(`Adding new contact ${nodeId}`)
            const remote = this.config.createDhtNodeRpcRemote(peerDescriptor)
            const isInNeighbors = (this.neighbors.get(peerDescriptor.nodeId) !== null)
            const isInClosestContacts = (this.closestContacts.getContact(nodeId) !== undefined)
            const isInRingContacts = this.ringContacts.getContact(peerDescriptor) !== undefined

            if (isInNeighbors || isInClosestContacts) {
                this.randomContacts.addContact(remote)
            }
            if (!isInNeighbors) {
                this.neighbors.add(remote)
            }
            if (!isInClosestContacts) {
                this.closestContacts.addContact(remote)
            }
            if (!isInRingContacts) {
                this.ringContacts.addContact(remote)
            }
        }
    }
}
