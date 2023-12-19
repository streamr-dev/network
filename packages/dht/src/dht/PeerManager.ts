import {
    Logger, hexToBinary
} from '@streamr/utils'
import KBucket from 'k-bucket'
import {
    getNodeIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'
import {
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { RandomContactList } from './contact/RandomContactList'
import { SortedContactList } from './contact/SortedContactList'
import { ConnectionManager } from '../connection/ConnectionManager'
import EventEmitter from 'eventemitter3'
import { DataKey, NodeID, NodeIDOrDataKeyRaw } from '../identifiers'

const logger = new Logger(module)

interface PeerManagerConfig {
    numberOfNodesPerKBucket: number
    maxContactListSize: number
    peerDiscoveryQueryBatchSize: number
    localNodeId: NodeID
    connectionManager: ConnectionManager
    isLayer0: boolean
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
}

export interface PeerManagerEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kBucketEmpty: () => void
}

export const getDistance = (nodeIdOrDataKeyRaw1: NodeIDOrDataKeyRaw, nodeIdOrDataKeyRaw2: NodeIDOrDataKeyRaw): number => {
    return KBucket.distance(nodeIdOrDataKeyRaw1, nodeIdOrDataKeyRaw2)
}

export class PeerManager extends EventEmitter<PeerManagerEvents> {

    // Glossary: 
    // * 'neighbors' are the nodes that are our neighbors according to 
    //   the protocol of the layer we are in
    // * 'connections' are the nodes that are connected to this node on Layer0
    // * 'contacts' are all non-unresponsive nodes that we know about

    // The kademlia k-bucket
    private bucket: KBucket<DhtNodeRpcRemote>
    // Nodes that are connected to this node on Layer0
    public readonly connections: Map<NodeID, DhtNodeRpcRemote> = new Map()
    // All nodes that we know about
    private contacts: SortedContactList<DhtNodeRpcRemote>
    private randomPeers: RandomContactList<DhtNodeRpcRemote>
    private stopped: boolean = false
    private readonly config: PeerManagerConfig

    constructor(config: PeerManagerConfig) {
        super()
        this.config = config
        this.bucket = new KBucket<DhtNodeRpcRemote>({
            localNodeId: hexToBinary(this.config.localNodeId),
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })
        this.bucket.on('ping', (oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: DhtNodeRpcRemote) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: DhtNodeRpcRemote) => this.onKBucketAdded(contact))
        this.bucket.on('updated', () => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.contacts = new SortedContactList({
            referenceId: this.config.localNodeId, 
            maxSize: this.config.maxContactListSize,
            allowToContainReferenceId: false,
            emitEvents: true
        })
        this.contacts.on('contactRemoved', (removedContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', removedContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
            this.randomPeers.addContact(this.config.createDhtNodeRpcRemote(removedContact.getPeerDescriptor()))
        })
        this.contacts.on('newContact', (newContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('newContact', newContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
        this.randomPeers = new RandomContactList(this.config.localNodeId, this.config.maxContactListSize)
        this.randomPeers.on('contactRemoved', (removedContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('randomContactRemoved', removedContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
        this.randomPeers.on('newContact', (newContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('newRandomContact', newContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
    }

    private onKBucketPing(oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtNodeRpcRemote> = new SortedContactList({
            referenceId: this.config.localNodeId, 
            maxSize: 100,  // TODO use config option or named constant?
            allowToContainReferenceId: false,
            emitEvents: false
        })
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()
        this.config.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())
        this.bucket.remove(hexToBinary(sortedContacts[sortedContacts.length - 1].getNodeId()))
        this.bucket.add(newContact)
    }

    private onKBucketRemoved(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
        logger.trace(`Removed contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        if (this.bucket.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        if (contact.getNodeId() !== this.config.localNodeId) {
            // Important to lock here, before the ping result is known
            this.config.connectionManager?.weakLockConnection(contact.getPeerDescriptor())
            if (this.connections.has(contact.getNodeId())) {
                logger.trace(`Added new contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
            } else {    // open connection by pinging
                logger.trace('starting ping ' + getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
                    } else {
                        logger.trace('ping failed ' + getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))
                        this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
                        this.removeContact(contact.getPeerDescriptor())
                        this.addClosestContactToBucket()
                    }
                    return
                }).catch((_e) => {
                    this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
                    this.removeContact(contact.getPeerDescriptor())
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
            this.handleNewPeers([closest.getPeerDescriptor()])
        }
    }

    private getClosestActiveContactNotInBucket(): DhtNodeRpcRemote | undefined {
        for (const contactId of this.contacts.getContactIds()) {
            if (!this.bucket.get(hexToBinary(contactId)) && this.contacts.isActive(contactId)) {
                return this.contacts.getContact(contactId)!.contact
            }
        }
        return undefined
    }

    handleConnected(peerDescriptor: PeerDescriptor): void {
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
        logger.trace('connected: ' + getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + this.connections.size)
    }

    handleDisconnected(peerDescriptor: PeerDescriptor, gracefulLeave: boolean): void {
        logger.trace('disconnected: ' + getNodeIdFromPeerDescriptor(peerDescriptor))
        this.connections.delete(getNodeIdFromPeerDescriptor(peerDescriptor))
        if (this.config.isLayer0) {
            this.bucket.remove(peerDescriptor.nodeId)
            if (gracefulLeave === true) {
                logger.trace(getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
                this.removeContact(peerDescriptor)
            } else {
                logger.trace(getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
            }
        }
    }

    handlePeerLeaving(peerDescriptor: PeerDescriptor): void {
        this.removeContact(peerDescriptor)
    }

    private removeContact(contact: PeerDescriptor): void {
        if (this.stopped) {
            return
        }
        logger.trace(`Removing contact ${getNodeIdFromPeerDescriptor(contact)}`)
        const nodeId = getNodeIdFromPeerDescriptor(contact)
        this.bucket.remove(hexToBinary(nodeId))
        this.contacts.removeContact(nodeId)
        this.randomPeers.removeContact(nodeId)
    }

    stop(): void {
        this.stopped = true
        this.bucket.toArray().forEach((rpcRemote: DhtNodeRpcRemote) => {
            rpcRemote.leaveNotice()
            this.bucket.remove(rpcRemote.id)
        })
        this.bucket.removeAllListeners()
        this.contacts.stop()
        this.randomPeers.stop()
        this.connections.clear()
    }

    getClosestNeighborsTo(referenceId: NodeID | DataKey, limit?: number, excludedNodeIds?: Set<NodeID>): DhtNodeRpcRemote[] {
        const closest = new SortedContactList<DhtNodeRpcRemote>({
            referenceId,
            allowToContainReferenceId: true,
            emitEvents: false,
            excludedNodeIds
        }) 
        this.bucket.toArray().map((contact) => closest.addContact(contact))
        return closest.getClosestContacts(limit)
    }

    // TODO reduce copy-paste?
    getClosestContactsTo(referenceId: NodeID, limit?: number, excludedNodeIds?: Set<NodeID>): DhtNodeRpcRemote[] {
        const closest = new SortedContactList<DhtNodeRpcRemote>({
            referenceId,
            allowToContainReferenceId: true,
            emitEvents: false,
            excludedNodeIds
        })
        this.contacts.getAllContacts().map((contact) => closest.addContact(contact))
        // TODO should set the excludeSet and limit to SortedContactList constructor and remove these line
        return closest.getClosestContacts(limit)
    }

    getNumberOfContacts(excludedNodeIds?: Set<NodeID>): number {
        return this.contacts.getAllContacts().filter((contact) => {
            if (!excludedNodeIds) {
                return true
            } else {
                return !excludedNodeIds.has(contact.getNodeId())
            } 
        }).length
    }

    getNumberOfConnections(): number {
        return this.connections.size
    }

    getNumberOfNeighbors(): number {
        return this.bucket.count()
    }

    getNeighbors(): PeerDescriptor[] {
        return this.bucket.toArray().map((rpcRemote: DhtNodeRpcRemote) => rpcRemote.getPeerDescriptor())
    }

    handlePeerActive(nodeId: NodeID): void {
        this.contacts.setActive(nodeId)
    }

    handlePeerUnresponsive(nodeId: NodeID): void {
        this.bucket.remove(hexToBinary(nodeId))
        this.contacts.removeContact(nodeId)
    }

    handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void { 
        if (this.stopped) {
            return
        }
        peerDescriptors.forEach((contact) => {
            const nodeId = getNodeIdFromPeerDescriptor(contact)
            if (nodeId !== this.config.localNodeId) {
                logger.trace(`Adding new contact ${nodeId}`)
                const remote = this.config.createDhtNodeRpcRemote(contact)
                const isInBucket = (this.bucket.get(contact.nodeId) !== null)
                const isInContacts = (this.contacts.getContact(nodeId) !== undefined)
                if (isInBucket || isInContacts) {
                    this.randomPeers.addContact(remote)
                }
                if (!isInBucket) {
                    this.bucket.add(remote)
                } 
                if (!isInContacts) {
                    this.contacts.addContact(remote)
                } 
                if (setActive) {
                    this.contacts.setActive(nodeId)
                }
            }
        })
    }
}
