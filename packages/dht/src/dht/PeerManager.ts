/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */

import KBucket from 'k-bucket'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'
import { IPeerManager } from './IPeerManager'
import { SortedContactList } from './contact/SortedContactList'
import { RandomContactList } from './contact/RandomContactList'
import { PeerID, PeerIDKey } from '../helpers/PeerID'
import { Logger } from '@streamr/utils'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { ConnectionManager } from '../connection/ConnectionManager'
import EventEmitter from 'eventemitter3'

const logger = new Logger(module)

export interface PeerManagerConfig {
    numberOfNodesPerKBucket: number
    maxNeighborListSize: number
    peerDiscoveryQueryBatchSize: number
    ownPeerId: PeerID
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

interface IPeerManagerTest {
    getNeighborList: () => SortedContactList<DhtNodeRpcRemote>
    getKBucketSize: () => number
    getKBucketPeers: () => PeerDescriptor[]
}

export class PeerManager extends EventEmitter<PeerManagerEvents> implements IPeerManager {
    private _jee: number = 0
    private bucket?: KBucket<DhtNodeRpcRemote>
    private neighborList?: SortedContactList<DhtNodeRpcRemote>
    private randomPeers?: RandomContactList<DhtNodeRpcRemote>
    public readonly connections: Map<PeerIDKey, DhtNodeRpcRemote> = new Map()
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
        this.bucket = new KBucket<DhtNodeRpcRemote>({
            localNodeId: selfId.value,
            numberOfNodesPerKBucket: this.config.numberOfNodesPerKBucket,
            numberOfNodesToPing: this.config.numberOfNodesPerKBucket
        })

        this.bucket.on('ping', (oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote) => this.onKBucketPing(oldContacts, newContact))
        this.bucket.on('removed', (contact: DhtNodeRpcRemote) => this.onKBucketRemoved(contact))
        this.bucket.on('added', (contact: DhtNodeRpcRemote) => this.onKBucketAdded(contact))
        this.bucket.on('updated', (_oldContact: DhtNodeRpcRemote, _newContact: DhtNodeRpcRemote) => {
            // TODO: Update contact info to the connection manager and reconnect
        })
        this.neighborList = new SortedContactList(selfId, this.config.maxNeighborListSize)
        this.neighborList.on('contactRemoved', (removedContact: DhtNodeRpcRemote, closestContacts: DhtNodeRpcRemote[]) => {
            if (this.stopped) {
                return
            }
            this.emit('contactRemoved', removedContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
            this.randomPeers!.addContact(removedContact)
        })
        this.neighborList.on('newContact', (newContact: DhtNodeRpcRemote, closestContacts: DhtNodeRpcRemote[]) =>
            this.emit('newContact', newContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        this.randomPeers = new RandomContactList(selfId, this.config.maxNeighborListSize)
        this.randomPeers.on('contactRemoved', (removedContact: DhtNodeRpcRemote, closestContacts: DhtNodeRpcRemote[]) =>
            this.emit('randomContactRemoved', removedContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
        this.randomPeers.on('newContact', (newContact: DhtNodeRpcRemote, closestContacts: DhtNodeRpcRemote[]) =>
            this.emit('newRandomContact', newContact.getPeerDescriptor(), closestContacts.map((peer) => peer.getPeerDescriptor()))
        )
    }

    private onKBucketPing(oldContacts: DhtNodeRpcRemote[], newContact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        const sortingList: SortedContactList<DhtNodeRpcRemote> = new SortedContactList(this.config.ownPeerId!, 100)
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
        logger.trace(`Removed contact ${contact.getPeerId().value.toString()}`)
        if (this.bucket!.count() === 0) {
            this.emit('kBucketEmpty')
        }
    }

    private onKBucketAdded(contact: DhtNodeRpcRemote): void {
        if (this.stopped) {
            return
        }
        if (!contact.getPeerId().equals(this.config.ownPeerId!)) {
            // Important to lock here, before the ping result is known
            this.config.connectionManager?.weakLockConnection(contact.getPeerDescriptor())
            if (this.connections.has(contact.getPeerId().toKey())) {
                logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
            } else {    // open connection by pinging       
                contact.ping().then((result) => {
                    if (result) {
                        logger.trace(`Added new contact ${contact.getPeerId().value.toString()}`)
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

    private getClosestActiveContactNotInBucket(): DhtNodeRpcRemote | undefined {
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

        const DhtNodeRpcRemote = this.config.createDhtNodeRpcRemote(peerDescriptor)
        if (!this.connections.has(PeerID.fromValue(DhtNodeRpcRemote.id).toKey())) {
            this.connections.set(PeerID.fromValue(DhtNodeRpcRemote.id).toKey(), DhtNodeRpcRemote)
        } else {
            logger.trace('new connection not set to connections, there is already a connection with the peer ID')
        }
    }

    public handleDisconnected(peerDescriptor: PeerDescriptor, gracefulLeave: boolean): void {
        this.connections.delete(keyFromPeerDescriptor(peerDescriptor))
        // only remove from bucket if we are on layer 0
        if (this.config.isLayer0) {
            this.bucket!.remove(peerDescriptor.kademliaId)
            if (gracefulLeave) {
                this.removeContact(peerDescriptor)
            } 
        }
    }

    public handlePeerLeaving(peerDescriptor: PeerDescriptor): void {
        this.removeContact(peerDescriptor)
    }

    private removeContact(contact: PeerDescriptor): void {
        if (this.stopped) {
            return
        }
        logger.trace(`Removing contact ${contact.kademliaId.toString()}`)
        const peerId = peerIdFromPeerDescriptor(contact)
        this.bucket!.remove(peerId.value)
        this.neighborList!.removeContact(peerId)
        this.randomPeers!.removeContact(peerId)
    }

    public stop(): void {
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

    // IPeerManager implementation start

    public getClosestPeersTo = (kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): DhtNodeRpcRemote[] => {
        const closest = new SortedContactList<DhtNodeRpcRemote>(PeerID.fromValue(kademliaId))
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

    public handlePeerActive(peer: DhtNodeRpcRemote): void {
        this.neighborList!.setActive(peer.getPeerId())
    }

    public handlePeerUnresponsive(peer: DhtNodeRpcRemote): void { 
        this.bucket!.remove(peer.getPeerId().value)
        this.neighborList!.removeContact(peer.getPeerId())
    }

    public handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void { 
        peerDescriptors.forEach((contact) => {
            if (this.stopped) {
                return
            }
            const peerId = peerIdFromPeerDescriptor(contact)
            if (!peerId.equals(this.config.ownPeerId!)) {
                logger.trace(`Adding new contact ${contact.kademliaId.toString()}`)
                const DhtNodeRpcRemote = this.config.createDhtNodeRpcRemote(contact)
                if (this.bucket!.get(contact.kademliaId) || this.neighborList!.getContact(peerIdFromPeerDescriptor(contact))) {
                    this.randomPeers!.addContact(DhtNodeRpcRemote)
                }
                if (!this.bucket!.get(contact.kademliaId) ) {
                    this.bucket!.add(DhtNodeRpcRemote)
                } 
                if (!this.neighborList!.getContact(peerIdFromPeerDescriptor(contact))) {
                    this.neighborList!.addContact(DhtNodeRpcRemote)
                } 
                if (setActive) {
                    this.neighborList!.setActive(peerId)
                }
            }
        })
    }

    public getDistance(kademliaId1: Uint8Array, kademliaId2: Uint8Array): number {
        return KBucket.distance(kademliaId1, kademliaId2)
    }
    // IPeerManager implementation end

}
