import KBucket from 'k-bucket'
import PQueue from 'p-queue'
import EventEmitter from 'events'
import { BloomFilter } from 'bloomfilter'

import { SortedContactList } from './SortedContactList'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { DhtTransportServer } from '../transport/DhtTransportServer'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerDescriptor, RouteMessageType, RouteMessageWrapper } from '../proto/DhtRpc'
import { IMessageRouter, RouteMessageParams, Event as MessageRouterEvent } from '../rpc-protocol/IMessageRouter'
import { stringFromId } from './helpers'
import { PeerID } from '../types'
import { DhtPeer } from './DhtPeer'
import { DhtTransportClient } from '../transport/DhtTransportClient'

export class DhtNode extends EventEmitter implements IMessageRouter {
    private readonly ALPHA = 3
    private K = 4
    private readonly peers: Map<PeerID, DhtPeer>
    private readonly selfId: PeerID
    private readonly numberOfNodesPerKBucket = 1
    private readonly bucket: KBucket<DhtPeer>
    private readonly neighborList: SortedContactList
    private readonly dhtRpcClient: DhtRpcClient
    private readonly dhtTransportClient: DhtTransportClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly rpcCommunicator: RpcCommunicator
    private readonly routerDuplicateDetector: BloomFilter
    private peerDescriptor: PeerDescriptor
    constructor(
        selfId: PeerID,
        dhtRpcClient: DhtRpcClient,
        dhtTransportClient: DhtTransportClient,
        dhtTransportServer: DhtTransportServer,
        rpcCommunicator: RpcCommunicator
    ) {
        super()
        this.selfId = selfId
        this.peerDescriptor = {
            peerId: selfId,
            type: 0
        }
        this.peers = new Map()
        this.bucket = new KBucket({
            localNodeId: this.selfId,
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
                    break
                }
            }
        })
        this.dhtRpcClient = dhtRpcClient
        this.neighborList = new SortedContactList(this.selfId)
        this.dhtTransportServer = dhtTransportServer
        this.dhtTransportClient = dhtTransportClient
        this.rpcCommunicator = rpcCommunicator
        this.routerDuplicateDetector = new BloomFilter(32 * 256, 16)
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
        this.routerDuplicateDetector.add(routedMessage.nonce)
        if (stringFromId(routedMessage.destinationPeer!.peerId) === stringFromId(this.selfId)) {
            this.emit(MessageRouterEvent.DATA, routedMessage.sourcePeer, routedMessage.messageType, routedMessage.message)
        } else {
            await this.routeMessage({
                messageType: routedMessage.messageType as RouteMessageType,
                message: routedMessage.message,
                previousPeer: routedMessage.previousPeer as PeerDescriptor,
                destinationPeer: routedMessage.destinationPeer as PeerDescriptor,
                sourcePeer: routedMessage.sourcePeer as PeerDescriptor,
                messageId: routedMessage.nonce
            })
        }
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
                !(stringFromId(peer.getPeerId()) === stringFromId(params.sourcePeer!.peerId)
                    || stringFromId(peer.getPeerId()) === stringFromId(params.previousPeer?.peerId || new Uint8Array()))
            )
        const initialLength = closest.length
        while (successAcks < this.ALPHA && successAcks < initialLength && closest.length > 0) {
            await queue.add(
                (async () => {
                    const success = await closest.pop()!.routeMessage({
                        ...params,
                        previousPeer: this.getPeerDescriptor()
                    })
                    if (success) {
                        successAcks += 1
                    }
                })
            )
        }
        if (successAcks === 0) {
            // Should errors be backpropagated?
            throw new Error('Could not route message forward')
        }
    }

    public canRoute(routedMessage: RouteMessageWrapper): boolean {
        if (routedMessage.destinationPeer!.peerId === this.selfId) {
            return true
        }
        if (this.routerDuplicateDetector.test(routedMessage)) {
            return false
        }
        const closestPeers = this.bucket.closest(routedMessage.destinationPeer!.peerId, this.K)
        const notRoutableCount = closestPeers.reduce((acc: number, curr: DhtPeer) => {
            if (stringFromId(curr.getPeerId()) === stringFromId(routedMessage.sourcePeer!.peerId)
                || stringFromId(curr.getPeerId()) === stringFromId(routedMessage.previousPeer?.peerId || new Uint8Array())) {
                return acc + 1
            }
            return acc
        }, 0)
        return (closestPeers.length - notRoutableCount) > 0
    }

    private async getClosestPeersFromContact(contact: DhtPeer) {
        this.neighborList.setContacted(contact.getPeerId())
        this.neighborList.setActive(contact.getPeerId())
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
            if (Buffer.compare(oldClosestContactId, this.neighborList.getClosestContactId()) == 0) {
                uncontacted = this.neighborList.getUncontactedContacts(this.K)
                if (uncontacted.length < 1) {
                    return
                }
            }
        }
    }

    async joinDht(entryPoint: DhtPeer): Promise<void> {
        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })
        if (Buffer.compare(this.selfId, entryPoint.getPeerId()) == 0) {
            return
        }
        this.bucket.add(entryPoint)
        const closest = this.bucket.closest(this.selfId, this.ALPHA)
        this.neighborList.addContacts(closest)
        await this.contactEntrypoints()

        while (true) {
            let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            const oldClosestContactId = this.neighborList.getClosestContactId()
            await Promise.allSettled(uncontacted.map((contact) => queue.add(
                (async () => await this.getClosestPeersFromContact(contact))
            )))
            if (this.neighborList.getActiveContacts().length >= this.K ||
                Buffer.compare(oldClosestContactId, this.neighborList.getClosestContactId()) == 0) {
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

    public stop(): void {
        this.rpcCommunicator.stop()
        this.dhtTransportServer.stop()
        this.dhtTransportClient.stop()
        this.bucket.removeAllListeners()
        this.removeAllListeners()
    }
}