import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import { SortedContactList } from './SortedContactList'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { DhtTransportServer } from '../transport/DhtTransportServer'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerDescriptor } from '../proto/DhtRpc'
import { PeerID } from '../PeerID'
import PQueue from 'p-queue'

export class DhtNode {
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
    private readonly dhtTransportServer: DhtTransportServer
    private readonly rpcCommunicator: RpcCommunicator
    private peerDescriptor: PeerDescriptor
    constructor(selfId: PeerID, dhtRpcClient: DhtRpcClient, dhtTransportServer: DhtTransportServer, rpcCommunicator: RpcCommunicator) {
        this.selfId = selfId
        this.objectId = DhtNode.objectCounter
        DhtNode.objectCounter++
        this.peerDescriptor = {
            peerId: selfId.value,
            type: 0
        }
        this.peers = new Map()
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
                    break
                }
            }
        })
        this.dhtRpcClient = dhtRpcClient
        this.neighborList = new SortedContactList(this.selfId.value)
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

    public onGetClosestPeers(caller: PeerDescriptor): DhtPeer[] {
        const ret = this.bucket.closest(caller.peerId, this.K)
        if (!this.bucket.get(caller.peerId)) {
            const contact = new DhtPeer(caller, this.dhtRpcClient)
            this.bucket.add(contact)
            this.neighborList.addContact(contact)
        }
        return ret
    }

    private async getClosestPeersFromContact(contact: DhtPeer): Promise<void> {
        this.neighborList.setContacted(contact.getPeerId().value)
        this.neighborList.setActive(contact.getPeerId().value)
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

    async joinDht(entryPointDescriptor: PeerDescriptor): Promise<void> {
        
        const entryPoint = new DhtPeer(entryPointDescriptor, this.dhtRpcClient)

        const queue = new PQueue({ concurrency: this.ALPHA, timeout: 3000 })
        if (Buffer.compare(this.selfId.value, entryPoint.getPeerId().value) == 0) {
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
        const methods = createRpcMethods(this.onGetClosestPeers.bind(this))
        this.dhtTransportServer.registerMethod('getClosestPeers', methods.getClosestPeers)
        this.dhtTransportServer.registerMethod('ping', methods.ping)
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