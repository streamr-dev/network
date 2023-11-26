import {
    Logger
} from '@streamr/utils'
import KBucket from 'k-bucket'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import {
    getNodeIdFromPeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'
import {
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { RandomContactList } from './contact/RandomContactList'
import { SortedContactList } from './contact/SortedContactList'
import { ConnectionManager } from '../connection/ConnectionManager'
import EventEmitter from 'eventemitter3'

const logger = new Logger(module)

interface PeerManagerConfig {
    numberOfNodesPerKBucket: number
    maxNeighborListSize: number
    peerDiscoveryQueryBatchSize: number
    ownPeerId: PeerID
    connectionManager: ConnectionManager
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
    removeContact: (contact: PeerDescriptor) => void
}

export interface PeerManagerEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kBucketEmpty: () => void
}

export class PeerManager extends EventEmitter<PeerManagerEvents> {

    // TODO make private
    public bucket?: KBucket<DhtNodeRpcRemote>
    // TODO make private
    public readonly connections: Map<PeerIDKey, DhtNodeRpcRemote> = new Map()
    // TODO make private
    public neighborList?: SortedContactList<DhtNodeRpcRemote>
    // TODO make private
    public randomPeers?: RandomContactList<DhtNodeRpcRemote>
    private readonly config: PeerManagerConfig
    private stopped: boolean = false

    constructor(config: PeerManagerConfig) {
        super()
        this.config = config
        this.initKBuckets()
    }

    private initKBuckets() {
        this.bucket = new KBucket<DhtNodeRpcRemote>({
            localNodeId: this.config.ownPeerId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })
        this.bucket.on('ping', (oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: DhtNodeRpcRemote) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: DhtNodeRpcRemote) => this.onKBucketAdded(contact))
        this.bucket.on('updated', () => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(this.config.ownPeerId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (removedContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', removedContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
            this.randomPeers!.addContact(this.config.createDhtNodeRpcRemote(removedContact.getPeerDescriptor()))
        })
        this.neighborList.on('newContact', (newContact: DhtNodeRpcRemote, activeContacts: DhtNodeRpcRemote[]) =>
            this.emit('newContact', newContact.getPeerDescriptor(), activeContacts.map((c) => c.getPeerDescriptor()))
        )
        this.randomPeers = new RandomContactList(this.config.ownPeerId, this.config.maxNeighborListSize)
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
        const sortingList: SortedContactList<DhtNodeRpcRemote> = new SortedContactList(this.config.ownPeerId, 100)
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()
        this.config.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())
        this.bucket?.remove(sortedContacts[sortedContacts.length - 1].getPeerId().value)
        this.bucket!.add(newContact)
    }

    private onKBucketRemoved(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
        logger.trace(`Removed contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
        if (this.bucket!.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        if (!contact.getPeerId().equals(this.config.ownPeerId)) {
            // Important to lock here, before the ping result is known
            this.config.connectionManager?.weakLockConnection(contact.getPeerDescriptor())
            if (this.connections.has(contact.getPeerId().toKey())) {
                logger.trace(`Added new contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
            } else {    // open connection by pinging
                logger.trace('starting ping ' + getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${getNodeIdFromPeerDescriptor(contact.getPeerDescriptor())}`)
                    } else {
                        logger.trace('ping failed ' + getNodeIdFromPeerDescriptor(contact.getPeerDescriptor()))
                        this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
                        this.config.removeContact(contact.getPeerDescriptor())
                        this.addClosestContactToBucket()
                    }
                    return
                }).catch((_e) => {
                    this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
                    this.config.removeContact(contact.getPeerDescriptor())
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
            this.addNewContact(closest.getPeerDescriptor())
        }
    }

    private getClosestActiveContactNotInBucket(): DhtNodeRpcRemote | undefined {
        for (const contactId of this.neighborList!.getContactIds()) {
            if (!this.bucket!.get(contactId.value) && this.neighborList!.isActive(contactId)) {
                return this.neighborList!.getContact(contactId)!.contact
            }
        }
        return undefined
    }

    onTransportConnected(peerDescriptor: PeerDescriptor): void {
        if (PeerID.fromValue(peerDescriptor.kademliaId).equals(this.config.ownPeerId)) {
            logger.error('onTransportConnected() to self')
        }
        const rpcRemote = this.config.createDhtNodeRpcRemote(peerDescriptor)
        if (!this.connections.has(PeerID.fromValue(rpcRemote.id).toKey())) {
            this.connections.set(PeerID.fromValue(rpcRemote.id).toKey(), rpcRemote)
            logger.trace('connectionschange add ' + this.connections.size)
        } else {
            logger.trace('new connection not set to connections, there is already a connection with the peer ID')
        }
        logger.trace('connected: ' + getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + this.connections.size)
    }

    onTransportDisconnected(peerDescriptor: PeerDescriptor, gracefulLeave: boolean): void {
        logger.trace('disconnected: ' + getNodeIdFromPeerDescriptor(peerDescriptor))
        this.connections.delete(keyFromPeerDescriptor(peerDescriptor))
        // only remove from bucket if we are on layer 0
        if (this.config.connectionManager) {
            this.bucket!.remove(peerDescriptor.kademliaId)
            if (gracefulLeave === true) {
                logger.trace(getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
                this.config.removeContact(peerDescriptor)
            } else {
                logger.trace(getNodeIdFromPeerDescriptor(peerDescriptor) + ' ' + 'onTransportDisconnected with gracefulLeave ' + gracefulLeave)
            }
        }
    }

    handleConnected(peer: PeerDescriptor): void {
        const rpcRemote = this.config.createDhtNodeRpcRemote(peer)
        if (PeerID.fromValue(peer.kademliaId).equals(this.config.ownPeerId)) {
            logger.error('own peerdescriptor added to connections in initKBucket')
        }
        this.connections.set(keyFromPeerDescriptor(peer), rpcRemote)
    }

    stop(): void {
        this.stopped = true
        this.bucket!.toArray().forEach((rpcRemote: DhtNodeRpcRemote) => { 
            rpcRemote.leaveNotice()
            this.bucket!.remove(rpcRemote.id)
        })
        this.bucket!.removeAllListeners()
        this.neighborList!.stop()
        this.randomPeers!.stop()
        this.connections.clear()
    }

    handleNewPeers(contacts: PeerDescriptor[]): void {
        contacts.forEach((contact) => {
            if (!PeerID.fromValue(contact.kademliaId).equals(this.config.ownPeerId)) {
                const rpcRemote = this.config.createDhtNodeRpcRemote(contact)
                this.addNewContact(contact)
                if (this.neighborList!.getContact(rpcRemote.getPeerId()) !== undefined) {
                    this.neighborList!.addContact(rpcRemote)
                }
            }
        })
    }

    addNewContact(contact: PeerDescriptor, setActive = false): void {
        if (this.stopped) {
            return
        }
        if (!PeerID.fromValue(contact.kademliaId).equals(this.config.ownPeerId)) {
            logger.trace(`Adding new contact ${getNodeIdFromPeerDescriptor(contact)}`)
            const rpcRemote = this.config.createDhtNodeRpcRemote(contact)
            if ((this.bucket!.get(contact.kademliaId) === null) 
                && (this.neighborList!.getContact(peerIdFromPeerDescriptor(contact)) === undefined)
            ) {
                this.neighborList!.addContact(rpcRemote)
                if (setActive) {
                    const peerId = peerIdFromPeerDescriptor(contact)
                    this.neighborList!.setActive(peerId)
                }
                this.bucket!.add(rpcRemote)
            } else {
                this.randomPeers!.addContact(rpcRemote)
            }
        }
    }
}
