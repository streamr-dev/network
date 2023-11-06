/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */

import KBucket from 'k-bucket'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { RemoteDhtNode } from './RemoteDhtNode'
import { IPeerManager } from './IPeerManager'
import { SortedContactList } from './contact/SortedContactList'
import { RandomContactList } from './contact/RandomContactList'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { Logger } from '@streamr/utils'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { ConnectionManager } from '../connection/ConnectionManager'
import EventEmitter from 'eventemitter3'
import { DisconnectionType } from '../transport/ITransport'

const logger = new Logger(module)

export interface PeerManagerConfig {
    numberOfNodesPerKBucket: number
    maxNeighborListSize: number
    peerDiscoveryQueryBatchSize: number
    ownPeerId: PeerID
    connectionManager: ConnectionManager
    isLayer0: boolean
    createRemoteDhtNode: (peerDescriptor: PeerDescriptor) => RemoteDhtNode
}

export interface PeerManagerEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newKbucketContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kbucketContactRemoved: (peerDescriptor: PeerDescriptor) => void
    newOpenInternetContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    openInternetContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    kBucketEmpty: () => void
}

interface IPeerManagerTest {
    getNeighborList: () => SortedContactList<RemoteDhtNode>
    getKBucketSize: () => number
    getKBucketPeers: () => PeerDescriptor[]
}

export class PeerManager extends EventEmitter<PeerManagerEvents> implements IPeerManager {
    private _jee: number = 0
    private bucket?: KBucket<RemoteDhtNode>
    private neighborList?: SortedContactList<RemoteDhtNode>
    private openInternetPeers?: SortedContactList<RemoteDhtNode>
    private randomPeers?: RandomContactList<RemoteDhtNode>
    public readonly connections: Map<PeerIDKey, RemoteDhtNode> = new Map()
    private readonly config: PeerManagerConfig
    private stopped = false

    private testInterface: IPeerManagerTest = {
        getNeighborList: () => { return this.neighborList! },
        getKBucketSize: () => { return this.bucket!.count() },
        getKBucketPeers: () => { return this.bucket!.toArray().map((peer) => peer.getPeerDescriptor()) }
    }
    public testInterfaceType?: IPeerManagerTest 

    constructor(config: PeerManagerConfig) {
        super()
        this.config = config
        this.initKBuckets(config.ownPeerId)
    }

    private initKBuckets = (selfId: PeerID) => {
        this.bucket = new KBucket<RemoteDhtNode>({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', (oldContacts: RemoteDhtNode[], newContact: RemoteDhtNode) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: RemoteDhtNode) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: RemoteDhtNode) => this.onKBucketAdded(contact))
        this.bucket.on('updated', (_oldContact: RemoteDhtNode, _newContact: RemoteDhtNode) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (removedContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', removedContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
            this.randomPeers!.addContact(removedContact)
        })
        this.neighborList.on('newContact', (newContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) =>
            this.emit('newContact', newContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        this.openInternetPeers = new SortedContactList(selfId, this.config.maxNeighborListSize / 2)
        this.openInternetPeers.on('contactRemoved', (removedContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) =>
            this.emit('openInternetContactRemoved', removedContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        this.openInternetPeers.on('newContact', (newContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) =>
            this.emit('newOpenInternetContact', newContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        
        this.randomPeers = new RandomContactList(selfId, this.config.maxNeighborListSize)
        this.randomPeers.on('contactRemoved', (removedContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) =>
            this.emit('randomContactRemoved', removedContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        this.randomPeers.on('newContact', (newContact: RemoteDhtNode, closestContacts: RemoteDhtNode[]) =>
            this.emit('newRandomContact', newContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
    }

    private onKBucketPing(oldContacts: RemoteDhtNode[], newContact: RemoteDhtNode): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<RemoteDhtNode> = new SortedContactList(this.config.ownPeerId!, 100)
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()
        this.config.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())
        this.bucket?.remove(sortedContacts[sortedContacts.length - 1].getPeerId().value)
        this.bucket!.add(newContact)
    }

    private onKBucketRemoved(contact: RemoteDhtNode): void {
        if (this.stopped) {
            return
        }
        this.config.connectionManager?.weakUnlockConnection(contact.getPeerDescriptor())
        logger.trace(`Removed contact ${contact.getPeerId().value.toString()}`)
        this.emit(
            'kbucketContactRemoved',
            contact.getPeerDescriptor()
        )
        if (this.bucket!.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: RemoteDhtNode): void {
        if (this.stopped) {
            return
        }
        if (!this.stopped && !contact.getPeerId().equals(this.config.ownPeerId!)) {
            // Important to lock here, before the ping result is known
            this.config.connectionManager?.weakLockConnection(contact.getPeerDescriptor())
            if (this.connections.has(contact.getPeerId().toKey())) {
                logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
                this.emit(
                    'newKbucketContact',
                    contact.getPeerDescriptor(),
                    this.neighborList!.getClosestContacts(this.config.peerDiscoveryQueryBatchSize).map((peer) => peer.getPeerDescriptor())
                )
            } else {    // open connection by pinging
               
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
                        this.emit(
                            'newKbucketContact',
                            contact.getPeerDescriptor(),
                            this.neighborList!.getClosestContacts(this.config.peerDiscoveryQueryBatchSize).map((peer) => peer.getPeerDescriptor())
                        )
                    } else {
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
            this.handleNewPeers([ closest.getPeerDescriptor() ])
        }
    }

    private getClosestActiveContactNotInBucket(): RemoteDhtNode | undefined {
        for (const contactId of this.neighborList!.getContactIds()) {
            if (!this.bucket!.get(contactId.value) && this.neighborList!.isActive(contactId)) {
                return this.neighborList!.getContact(contactId).contact
            }
        }
        return undefined
    }

    public handleConnected(peerDescriptor: PeerDescriptor): void {
        if (this.config.ownPeerId!.equals(PeerID.fromValue(peerDescriptor.kademliaId))) {
            logger.error('handleConnected() to self')
            return
        }

        const RemoteDhtNode = this.config.createRemoteDhtNode(peerDescriptor)
        if (!this.connections.has(PeerID.fromValue(RemoteDhtNode.id).toKey())) {
            this.connections.set(PeerID.fromValue(RemoteDhtNode.id).toKey(), RemoteDhtNode)
        } else {
            logger.trace('new connection not set to connections, there is already a connection with the peer ID')
        }
    }

    public handleDisconnected(peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType): void {
        this.connections.delete(keyFromPeerDescriptor(peerDescriptor))
        
        // only remove from bucket if we are on layer 0
        if (this.config.isLayer0) {
            this.bucket!.remove(peerDescriptor.kademliaId)

            if (disconnectionType === 'OUTGOING_GRACEFUL_LEAVE' || disconnectionType === 'INCOMING_GRACEFUL_LEAVE') {
                this.removeContact(peerDescriptor, true)
            } 
        }
    }

    public handlePeerLeaving(peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        this.removeContact(peerDescriptor, removeFromOpenInternetPeers)
    }

    private removeContact(contact: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        if (this.stopped) {
            return
        }
        logger.trace(`Removing contact ${contact.kademliaId.toString()}`)
        const peerId = peerIdFromPeerDescriptor(contact)
        this.bucket!.remove(peerId.value)
        this.neighborList!.removeContact(peerId)
        this.randomPeers!.removeContact(peerId)
        if (removeFromOpenInternetPeers) {
            this.openInternetPeers!.removeContact(peerId)
        }
    }

    public stop(): void {
        this.stopped = true

        this.bucket!.toArray().map((RemoteDhtNode: RemoteDhtNode) => this.bucket!.remove(RemoteDhtNode.id))
        this.bucket!.removeAllListeners()
        this.neighborList!.stop()
        this.randomPeers!.stop()
        this.openInternetPeers!.stop()
        this.connections.clear()
    }

    // IPeerManager implementation start

    public getClosestPeersTo = (kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): RemoteDhtNode[] => {
        const closest = new SortedContactList<RemoteDhtNode>(PeerID.fromValue(kademliaId))
        this.neighborList!.getAllContacts().map((contact) => closest.addContact(contact))
        this.bucket!.toArray().map((contact) => closest.addContact(contact))
        return closest.getClosestContacts(limit).filter((contact) => {
            if (!excludeSet) {
                return true
            } else {
                return !excludeSet.has(contact.getPeerId().toKey())
            } 
        })
    }

    public getNumberOfPeers = (excludeSet?: Set<PeerIDKey>): number => {
        return this.getClosestPeersTo(this.config.ownPeerId!.value, undefined, excludeSet).length
    }
    
    public getNumberOfConnections(): number {
        return this.connections.size
    }

    public getKBucketSize(): number {
        return this.bucket!.count()
    }

    public handlePeerActive(peer: RemoteDhtNode): void {
        this.neighborList!.setActive(peer.getPeerId())
        this.openInternetPeers!.setActive(peer.getPeerId())
    }

    public handlePeerUnresponsive(peer: RemoteDhtNode): void { 
        this.bucket!.remove(peer.getPeerId().value)
        this.neighborList!.removeContact(peer.getPeerId())
        this.openInternetPeers!.removeContact(peer.getPeerId())
    }

    public handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void { 
        peerDescriptors.forEach((contact) => {
            if (this.stopped) {
                return
            }
            const peerId = peerIdFromPeerDescriptor(contact)
            if (!peerId.equals(this.config.ownPeerId!)) {
                logger.trace(`Adding new contact ${contact.kademliaId.toString()}`)
                const RemoteDhtNode = this.config.createRemoteDhtNode(contact)
                if (!this.bucket!.get(contact.kademliaId) && !this.neighborList!.getContact(peerIdFromPeerDescriptor(contact))) {
                    this.neighborList!.addContact(RemoteDhtNode)
                    if (contact.openInternet) {
                        this.openInternetPeers!.addContact(RemoteDhtNode)
                    }
                    this.bucket!.add(RemoteDhtNode)
                } else {
                    this.randomPeers!.addContact(RemoteDhtNode)
                }
                if (setActive) {
                    this.neighborList!.setActive(peerId)
                    this.openInternetPeers!.setActive(peerId)
                }
            }
        })
    }

    public getDistance(kademliaId1: Uint8Array, kademliaId2: Uint8Array): number {
        return KBucket.distance(kademliaId1, kademliaId2)
    }
    // IPeerManager implementation end

}
