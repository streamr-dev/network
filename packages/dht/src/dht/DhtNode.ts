import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import PQueue from 'p-queue'
import EventEmitter from 'events'
import { SortedContactList } from './SortedContactList'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { ServerTransport } from '../transport/ServerTransport'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerID } from '../PeerID'
import {
    Message,
    PeerDescriptor,
    RouteMessageWrapper
} from '../proto/DhtRpc'
import { ClientTransport } from '../transport/ClientTransport'
import { RouterDuplicateDetector } from './RouterDuplicateDetector'
import { Err } from '../errors'
import { ITransport, Event as ITransportEvent } from '../transport/ITransport'

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    appId: string
    previousPeer?: PeerDescriptor
    messageId?: string
}

export enum Event {
    NEW_CONTACT = 'streamr:dht:dht-node:new-peer',
    CONTACT_REMOVED = 'streamr:dht:dht-node:peer-removed'
}

export const DEFAULT_APP_ID = 'layer0'

export class DhtNode extends EventEmitter implements ITransport {
    static objectCounter = 0
    private objectId = 1
    private readonly ALPHA = 3
    private K = 4
    private readonly peers: Map<string, DhtPeer>
    private readonly selfId: PeerID
    private readonly numberOfNodesPerKBucket = 1
    private readonly bucket: KBucket<DhtPeer>
    private readonly neighborList: SortedContactList
    private readonly dhtRpcClient: DhtRpcClient
    private readonly dhtTransportClient: ClientTransport
    private readonly dhtTransportServer: ServerTransport
    private readonly rpcCommunicator: RpcCommunicator
    private readonly routerDuplicateDetector: RouterDuplicateDetector
    private peerDescriptor: PeerDescriptor
    private readonly appId: string
    
    constructor(
        peerDescriptor: PeerDescriptor,
        dhtRpcClient: DhtRpcClient,
        dhtTransportClient: ClientTransport,
        dhtTransportServer: ServerTransport,
        rpcCommunicator: RpcCommunicator,
        appId = DEFAULT_APP_ID
    ) {
        super()
        this.objectId = DhtNode.objectCounter
        DhtNode.objectCounter++
        this.peerDescriptor = peerDescriptor
        this.selfId = PeerID.fromValue(this.peerDescriptor.peerId)
        this.peers = new Map()
        this.appId = appId
        this.bucket = new KBucket({
            localNodeId: this.selfId.value,
            numberOfNodesPerKBucket: this.numberOfNodesPerKBucket
        })
        this.bucket.on('ping', async (oldContacts, newContact) => {
            // Here the node should call ping() on all old contacts. If one of them fails it should be removed
            // and replaced with the newContact
            for (const contact of oldContacts) {
                const alive = await contact.ping(this.peerDescriptor)
                if (!alive) {
                    this.bucket.remove(contact.id)
                    this.bucket.add(newContact)
                    this.neighborList.removeContact(contact.peerId)
                    break
                }
            }
        })
        this.bucket.on('removed', (contact: DhtPeer) => {
            if (this.appId === DEFAULT_APP_ID) {
                const connectionManager = this.rpcCommunicator.getConnectionManager()
                connectionManager.disconnect(contact.getPeerDescriptor())
            }
            this.emit(Event.CONTACT_REMOVED, contact.getPeerDescriptor())
        })
        this.bucket.on('added', async (contact: DhtPeer) => {
            if (await contact.ping(this.peerDescriptor)) {
                this.emit(Event.NEW_CONTACT, contact.getPeerDescriptor())
            } else {
                this.bucket.remove(contact.peerId.value)
                this.neighborList.removeContact(contact.peerId)
                this.addClosestContactToBucket()
            }
        })
        this.bucket.on('updated', (_oldContact: DhtPeer, _newContact: DhtPeer) => {
            // TODO: Update contact info to the connection manager and reconnect
        })

        this.dhtRpcClient = dhtRpcClient
        this.neighborList = new SortedContactList(this.selfId, this.K * 4)
        this.dhtTransportServer = dhtTransportServer
        this.dhtTransportClient = dhtTransportClient
        this.rpcCommunicator = rpcCommunicator
        // False positives at 0.05% at maximum capacity
        this.routerDuplicateDetector = new RouterDuplicateDetector(2**15, 16, 1050, 2100)
        this.bindDefaultServerMethods()
    }

    public getNeighborList(): SortedContactList {
        return this.neighborList
    }

    public getSelfId(): PeerID {
        return this.selfId
    }

    public getDhtRpcClient(): DhtRpcClient {
        return this.dhtRpcClient
    }

    public onGetClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        const ret = this.bucket.closest(caller.peerId, this.K)
        if (!this.bucket.get(caller.peerId)) {
            const contact = new DhtPeer(caller, this.dhtRpcClient)
            this.bucket.add(contact)
            this.neighborList.addContact(contact)
        }
        return ret
    }

    public async onRoutedMessage(routedMessage: RouteMessageWrapper): Promise<void> {
        this.updateBucketAndNeighborList(routedMessage.sourcePeer!)
        this.routerDuplicateDetector.add(routedMessage.nonce)
        if (this.selfId.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            const message = Message.fromBinary(routedMessage.message)
            this.emit(ITransportEvent.DATA, routedMessage.sourcePeer, message, routedMessage.appId)
        } else {
            await this.routeMessage({
                message: routedMessage.message,
                previousPeer: routedMessage.previousPeer as PeerDescriptor,
                destinationPeer: routedMessage.destinationPeer as PeerDescriptor,
                sourcePeer: routedMessage.sourcePeer as PeerDescriptor,
                appId: routedMessage.appId,
                messageId: routedMessage.nonce
            })
        }
    }

    public send(targetPeerDescriptor: PeerDescriptor, msg: Message, appId?: string): void {
        const params: RouteMessageParams = {
            message: Message.toBinary(msg),
            destinationPeer: targetPeerDescriptor,
            appId: appId? appId : 'layer0',
            sourcePeer: this.peerDescriptor
        }
        this.routeMessage(params)
    }

    public async routeMessage(params: RouteMessageParams): Promise<void> {
        // If destination is in bucket
        if (this.bucket.get(params.destinationPeer.peerId)) {
            const destination = this.bucket.get(params.destinationPeer.peerId)
            try {
                const success = await destination!.routeMessage({
                    ...params,
                    previousPeer: this.peerDescriptor
                })
                if (success) {
                    return
                }
            } catch (err) {
                console.error(err)
            }
        }
        let successAcks = 0
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })
        const closest = this.bucket.closest(params.destinationPeer.peerId, this.K)
            .filter((peer: DhtPeer) =>
                !(peer.peerId.equals(PeerID.fromValue(params.sourcePeer!.peerId))
                    || (peer.peerId.equals(PeerID.fromValue(params.previousPeer?.peerId || new Uint8Array()))))
            )
        const initialLength = closest.length
        while (successAcks < this.ALPHA && successAcks < initialLength && closest.length > 0) {
            await queue.add(
                (async () => {
                    const success = await closest.shift()!.routeMessage({
                        ...params,
                        previousPeer: this.getPeerDescriptor()
                    })
                    if (success) {
                        successAcks += 1
                    }
                })
            )
        }
        // Only throw if originator
        if (successAcks === 0 && this.selfId.equals(PeerID.fromValue(params.sourcePeer!.peerId))) {
            throw new Err.CouldNotRoute(`Routing message to peer: ${PeerID.fromValue(params.destinationPeer!.peerId).toString()} failed.`)
        }
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (this.selfId.equals(PeerID.fromValue(routedMessage.destinationPeer!.peerId))) {
            return true
        }
        if (this.routerDuplicateDetector.test(routedMessage.nonce)) {
            return false
        }
        const closestPeers = this.bucket.closest(routedMessage.destinationPeer!.peerId, this.K)
        const notRoutableCount = closestPeers.reduce((acc: number, curr: DhtPeer) => {
            if (curr.peerId.equals(PeerID.fromValue(routedMessage.sourcePeer!.peerId)
                || curr.peerId.equals(PeerID.fromValue(routedMessage.previousPeer?.peerId || new Uint8Array())))) {
                return acc + 1
            }
            return acc
        }, 0)
        return (closestPeers.length - notRoutableCount) > 0
    }

    private async getClosestPeersFromContact(contact: DhtPeer) {
        this.neighborList.setContacted(contact.peerId)
        this.neighborList.setActive(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.peerDescriptor)
        const dhtPeers = returnedContacts.map((peer) => {
            return new DhtPeer(peer, this.dhtRpcClient)
        })
        this.neighborList.addContacts(dhtPeers)
        dhtPeers.forEach( (returnedContact) => {
            if (!this.bucket.get(returnedContact.id)) {
                this.bucket.add(returnedContact)
            }
        })
    }

    private async contactEntrypoints(): Promise<void> {
        while (true) {
            const oldClosestContactId = this.neighborList.getClosestContactId()
            let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                return
            }

            await this.getClosestPeersFromContact(uncontacted[0])
            if (oldClosestContactId.equals(this.neighborList.getClosestContactId())) {
                uncontacted = this.neighborList.getUncontactedContacts(this.K)
                if (uncontacted.length < 1) {
                    return
                }
            }
        }
    }

    async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
       
        const entryPoint = new DhtPeer(entryPointDescriptor, this.dhtRpcClient) 
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })
        
        if (this.selfId.equals(entryPoint.peerId)) {
            return
        }
        
        this.bucket.add(entryPoint)
        const closest = this.bucket.closest(this.selfId.value, this.ALPHA)
        this.neighborList.addContacts(closest)
        await this.contactEntrypoints()

        while (true) {
            let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            const oldClosestContactId = this.neighborList.getClosestContactId()
            await Promise.allSettled(uncontacted.map((contact) => queue.add(
                (async () => await this.getClosestPeersFromContact(contact))
            )))
            if (this.neighborList.getActiveContacts().length >= this.K ||
                oldClosestContactId.equals(this.neighborList.getClosestContactId())) {
                break
            }
            uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                break
            }
        }
    }

    public getBucketSize(): number {
        return this.bucket.count()
    }

    private updateBucketAndNeighborList(contact: PeerDescriptor): void {
        const dhtPeer = new DhtPeer(contact, this.dhtRpcClient)
        const peerId = PeerID.fromValue(contact.peerId)
        if (!this.neighborList.isContact(peerId)) {
            this.neighborList.addContact(dhtPeer)
        }
        this.neighborList.setActive(peerId)
        this.bucket.add(dhtPeer)
    }

    private bindDefaultServerMethods() {
        const methods = createRpcMethods(this.onGetClosestPeers.bind(this), this.onRoutedMessage.bind(this), this.canRoute.bind(this))
        this.dhtTransportServer.registerMethod('getClosestPeers', methods.getClosestPeers)
        this.dhtTransportServer.registerMethod('ping', methods.ping)
        this.dhtTransportServer.registerMethod('routeMessage', methods.routeMessage)
    }

    public getRpcCommunicator(): RpcCommunicator {
        return this.rpcCommunicator
    }

    public setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public getK(): number {
        return this.K
    }

    public getKBucketPeers(): PeerDescriptor[] {
        return this.bucket.toArray().map((dhtPeer) => dhtPeer.getPeerDescriptor())
    }

    private addClosestContactToBucket(): void {
        const closest = this.getClosestActiveContactNotInBucket()
        if (closest) {
            this.bucket.add(closest)
        }
    }

    private getClosestActiveContactNotInBucket(): DhtPeer | null {
        for (const contactId of this.neighborList.getContactIds()) {
            if (!this.bucket.get(contactId.value) && this.neighborList.isActive(contactId)) {
                return this.neighborList.getContact(contactId.toString()).contact
            }
        }
        return null
    }

    public stop(): void {
        this.rpcCommunicator.stop()
        this.dhtTransportServer.stop()
        this.dhtTransportClient.stop()
        this.bucket.removeAllListeners()
        this.removeAllListeners()
    }
}