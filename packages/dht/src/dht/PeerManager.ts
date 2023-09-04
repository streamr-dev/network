/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */

import KBucket from 'k-bucket'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { DhtPeer } from './DhtPeer'
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
    getClosestContactsLimit: number
    ownPeerId: PeerID
    connectionManager: ConnectionManager
    nodeName: string
    createDhtPeer: (peerDescriptor: PeerDescriptor) => DhtPeer
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
    getNeighborList: () => SortedContactList<DhtPeer>
    getKBucketSize: () => number
    getKBucketPeers: () => PeerDescriptor[]
}

export class PeerManager extends EventEmitter<PeerManagerEvents> implements IPeerManager {

    private bucket?: KBucket<DhtPeer>
    private neighborList?: SortedContactList<DhtPeer>
    private openInternetPeers?: SortedContactList<DhtPeer>
    private randomPeers?: RandomContactList<DhtPeer>
    public readonly connections: Map<PeerIDKey, DhtPeer> = new Map()
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
        this.bucket = new KBucket<DhtPeer>({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', (oldContacts: DhtPeer[], newContact: DhtPeer) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: DhtPeer) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: DhtPeer) => this.onKBucketAdded(contact))
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', peerDescriptor, activeContacts)
            this.randomPeers!.addContact(this.config.createDhtPeer(peerDescriptor))
        })
        this.neighborList.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newContact', peerDescriptor, activeContacts)
        )
        this.openInternetPeers = new SortedContactList(selfId, this.config.maxNeighborListSize / 2)
        this.openInternetPeers.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('openInternetContactRemoved', peerDescriptor, activeContacts)
        )
        this.openInternetPeers.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newOpenInternetContact', peerDescriptor, activeContacts)
        )
        
        this.randomPeers = new RandomContactList(selfId, this.config.maxNeighborListSize)
        this.randomPeers.on('contactRemoved', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('randomContactRemoved', peerDescriptor, activeContacts)
        )
        this.randomPeers.on('newContact', (peerDescriptor: PeerDescriptor, activeContacts: PeerDescriptor[]) =>
            this.emit('newRandomContact', peerDescriptor, activeContacts)
        )
    }

    private onKBucketPing(oldContacts: DhtPeer[], newContact: DhtPeer): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtPeer> = new SortedContactList(this.config.ownPeerId!, 100)
        sortingList.addContacts(oldContacts)
        const sortedContacts = sortingList.getAllContacts()
        this.config.connectionManager?.weakUnlockConnection(sortedContacts[sortedContacts.length - 1].getPeerDescriptor())
        this.bucket?.remove(sortedContacts[sortedContacts.length - 1].getPeerId().value)
        this.bucket!.add(newContact)
    }

    private onKBucketRemoved(contact: DhtPeer): void {
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

    private onKBucketAdded(contact: DhtPeer): void {
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
                    this.neighborList!.getClosestContacts(this.config.getClosestContactsLimit).map((peer) => peer.getPeerDescriptor())
                )
            } else {    // open connection by pinging
                logger.trace('starting ping ' + this.config.nodeName + ', ' + contact.getPeerDescriptor().nodeName + ' ')
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
                        this.emit(
                            'newKbucketContact',
                            contact.getPeerDescriptor(),
                            this.neighborList!.getClosestContacts(this.config.getClosestContactsLimit).map((peer) => peer.getPeerDescriptor())
                        )
                    } else {
                        logger.trace('ping failed ' + this.config.nodeName + ', ' + contact.getPeerDescriptor().nodeName + ' ')
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
        if ( this.stopped ) {
            return
        }
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.handleNewPeers([ closest.getPeerDescriptor() ])
        }
    }

    private getClosestActiveContactNotInBucket(): DhtPeer | undefined {
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

        const dhtPeer = this.config.createDhtPeer(peerDescriptor)
        if (!this.connections.has(PeerID.fromValue(dhtPeer.id).toKey())) {
            this.connections.set(PeerID.fromValue(dhtPeer.id).toKey(), dhtPeer)
            logger.trace(' ' + this.config.nodeName + ' connectionschange add ' + this.connections.size)
        } else {
            logger.trace('new connection not set to connections, there is already a connection with the peer ID')
        }
        if (this.config.nodeName === 'entrypoint') {
            logger.trace('connected: ' + this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ' + this.connections.size)
        }
    }

    public handleDisconnected(peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType, isLayer0 = false): void {
        logger.trace('disconnected: ' + this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ')
        this.connections.delete(keyFromPeerDescriptor(peerDescriptor))
        
        // only remove from bucket if we are on layer 0
        if (isLayer0) {
            this.bucket!.remove(peerDescriptor.kademliaId)

            if (disconnectionType === 'OUTGOING_GRACEFUL_LEAVE' || disconnectionType === 'INCOMING_GRACEFUL_LEAVE') {
                logger.trace( this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ' + 'onTransportDisconnected with type ' + disconnectionType)
                this.removeContact(peerDescriptor, true)
            } else {
                logger.trace( this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ' + 'onTransportDisconnected with type ' + disconnectionType)
            }
        }
    }

    public handlePeerLeaving(peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        logger.trace('peer leaving: ' + this.config.nodeName + ', ' + peerDescriptor.nodeName + ' ')
        this.removeContact(peerDescriptor, removeFromOpenInternetPeers)
    }

    private removeContact(contact: PeerDescriptor, removeFromOpenInternetPeers = false): void {
        if ( this.stopped ) {
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

        this.bucket!.toArray().map((dhtPeer: DhtPeer) => this.bucket!.remove(dhtPeer.id))
        this.bucket!.removeAllListeners()
        this.neighborList!.stop()
        this.randomPeers!.stop()
        this.openInternetPeers!.stop()
        this.connections.clear()
    }

    // IPeerManager implementation start

    public getClosestPeersTo = (kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): DhtPeer[] => {
        
        const closest = new SortedContactList<DhtPeer>(PeerID.fromValue(kademliaId))
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
        const closest = new SortedContactList<DhtPeer>(this.config.ownPeerId!)
        this.neighborList!.getAllContacts().map((contact) => closest.addContact(contact))
        this.bucket!.toArray().map((contact) => closest.addContact(contact))
        const numClosest = closest.getClosestContacts().filter((contact) => {
            if (!excludeSet) {
                return true
            } else {
                return !excludeSet.has(contact.getPeerId().toKey())
            } 
        }).length

        return numClosest
    }

    public getKBucketSize(): number {
        return this.bucket!.count()
    }

    public handlePeerActive(peer: DhtPeer): void {
        this.neighborList!.setActive(peer.getPeerId())
        this.openInternetPeers!.setActive(peer.getPeerId())
    }

    public handlePeerUnresponsive(peer: DhtPeer): void { 
        this.bucket!.remove(peer.getPeerId().value)
        this.neighborList!.removeContact(peer.getPeerId())
        this.openInternetPeers!.removeContact(peer.getPeerId())
    }

    public handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void { 
        peerDescriptors.forEach((contact) => {
            if ( this.stopped ) {
                return
            }
            const peerId = peerIdFromPeerDescriptor(contact)
            if (!peerId.equals(this.config.ownPeerId!)) {
                logger.trace(`Adding new contact ${contact.kademliaId.toString()}`)
                const dhtPeer = this.config.createDhtPeer(contact)
                if (!this.bucket!.get(contact.kademliaId) && !this.neighborList!.getContact(peerIdFromPeerDescriptor(contact))) {
                    this.neighborList!.addContact(dhtPeer)
                    if (contact.openInternet) {
                        this.openInternetPeers!.addContact(dhtPeer)
                    }
                    //this.contactAddCounter++
                    this.bucket!.add(dhtPeer)
                } else {
                    this.randomPeers!.addContact(dhtPeer)
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
