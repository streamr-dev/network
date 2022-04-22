import { PeerID } from '../types'
import { DhtPeer } from './DhtPeer'
import KBucket from 'k-bucket'
import { SortedContactList } from './SortedContactList'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { DhtTransportServer } from '../transport/DhtTransportServer'
import { createRpcMethods } from '../rpc-protocol/server'
import { RpcCommunicator } from '../transport/RpcCommunicator'
import { PeerDescriptor } from '../proto/DhtRpc'
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
        this.neighborList = new SortedContactList(this.selfId, [])
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

    private async getClosestPeersFromContacts(contactList: DhtPeer[]) {
        const promises = contactList.map(async (contact) => {
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
        })
        await Promise.allSettled(promises)
    }

    private async findContacts(): Promise<void> {
        const oldClosestContactId = this.neighborList.getClosestContactId()
        let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
        if (uncontacted.length < 1) {
            return
        }

        await this.getClosestPeersFromContacts(uncontacted)
        if (Buffer.compare(oldClosestContactId, this.neighborList.getClosestContactId()) == 0) {
            uncontacted = this.neighborList.getUncontactedContacts(this.K)
            if (uncontacted.length < 1) {
                return
            }
            await this.fillBuckets()
        }
        await this.findContacts()
    }

    private async fillBuckets(): Promise<void> {
        let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
        const oldClosestContactId = this.neighborList.getClosestContactId()
        await this.getClosestPeersFromContacts(uncontacted)

        if (this.neighborList.getActiveContacts().length >= this.K ||
            Buffer.compare(oldClosestContactId, this.neighborList.getClosestContactId()) == 0) {
            return
        }
        uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
        if (uncontacted.length < 1) {
            return
        }
        await this.fillBuckets()

    }

    async joinDht(entrypoint: DhtPeer): Promise<void> {
        if (Buffer.compare(this.selfId, entrypoint.getPeerId()) == 0) {
            return
        }
        this.bucket.add(entrypoint)
        const closest = this.bucket.closest(this.selfId, this.ALPHA)
        this.neighborList.addContacts(closest)

        await this.findContacts()
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
}