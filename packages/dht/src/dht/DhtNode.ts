import { PeerID } from '../types'
import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import { SortedContactList } from './SortedContactList'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { DhtTransportServer } from '../transport/DhtTransportServer'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerDescriptor } from '../proto/DhtRpc'
import PQueue from 'p-queue'
import { stringFromId } from './helpers'

export class DhtNode {
    private readonly ALPHA = 3
    private K = 4
    private readonly peers: Map<PeerID, DhtPeer>
    private readonly selfId: PeerID
    private readonly numberOfNodesPerKBucket = 1
    private readonly bucket: KBucket<DhtPeer>
    private readonly neighborList: SortedContactList
    private readonly dhtRpcClient: DhtRpcClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly rpcCommunicator: RpcCommunicator
    private peerDescriptor: PeerDescriptor
    constructor(selfId: PeerID, dhtRpcClient: DhtRpcClient, dhtTransportServer: DhtTransportServer, rpcCommunicator: RpcCommunicator) {
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
        this.dhtRpcClient = dhtRpcClient
        this.neighborList = new SortedContactList(this.selfId)
        this.dhtTransportServer = dhtTransportServer
        this.rpcCommunicator = rpcCommunicator
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

    public getClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        const ret = this.bucket.closest(caller.peerId)
        if (!this.bucket.get(caller.peerId)) {
            const contact = new DhtPeer(caller, this.dhtRpcClient)
            this.bucket.add(contact)
            this.neighborList.addContact(contact)
        }
        return ret
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
        console.log(`Node with id: ${stringFromId(this.selfId)} joining dht`)
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
            await Promise.all(uncontacted.map((contact) => queue.add(
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
        const methods = createRpcMethods(this.getClosestPeers.bind(this))
        this.dhtTransportServer.registerMethod('getClosestPeers', methods.getClosestPeers)
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
}