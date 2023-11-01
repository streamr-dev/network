import { RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import KBucket from 'k-bucket'
import { v4 } from 'uuid'
import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { SortedContactList } from '../contact/SortedContactList'
import { RemoteDhtNode } from '../RemoteDhtNode'
import { areEqualPeerDescriptors, keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface DiscoverySessionConfig {
    bucket: KBucket<RemoteDhtNode>
    neighborList: SortedContactList<RemoteDhtNode>
    targetId: Uint8Array
    ownPeerDescriptor: PeerDescriptor
    serviceId: string
    rpcCommunicator: RpcCommunicator
    parallelism: number
    noProgressLimit: number
    newContactListener?: (remoteDhtNode: RemoteDhtNode) => void
}

export class DiscoverySession {
    public readonly sessionId = v4()

    private stopped = false
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private outgoingClosestPeersRequestsCounter = 0
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly config: DiscoverySessionConfig

    constructor(config: DiscoverySessionConfig) {
        this.config = config
    }

    private addNewContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        contacts.forEach((contact) => {
            if (!areEqualPeerDescriptors(contact, this.config.ownPeerDescriptor)) {
                const remoteDhtNode = new RemoteDhtNode(
                    this.config.ownPeerDescriptor,
                    contact,
                    toProtoRpcClient(new DhtNodeRpcClient(this.config.rpcCommunicator.getRpcClientTransport())),
                    this.config.serviceId
                )
                if (this.config.newContactListener) {
                    this.config.newContactListener(remoteDhtNode)
                }
                if (!this.config.neighborList.getContact(remoteDhtNode.getPeerId())) {
                    this.config.neighborList.addContact(remoteDhtNode)
                }
            }
        })
    }

    private async getClosestPeersFromContact(contact: RemoteDhtNode): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${keyFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.outgoingClosestPeersRequestsCounter++
        this.config.neighborList.setContacted(contact.getPeerId())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.neighborList.setActive(contact.getPeerId())
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (!this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peerId.toKey())
        const oldClosestContact = this.config.neighborList.getClosestContactId()
        this.addNewContacts(contacts)
        if (this.config.neighborList.getClosestContactId().equals(oldClosestContact)) {
            this.noProgressCounter++
        } else {
            this.noProgressCounter = 0
        }
    }

    private onClosestPeersRequestFailed(peer: RemoteDhtNode) {
        if (!this.ongoingClosestPeersRequests.has(peer.getPeerId().toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peer.getPeerId().toKey())
        this.config.bucket.remove(peer.getPeerId().value)
        this.config.neighborList.removeContact(peer.getPeerId())
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = this.config.neighborList.getUncontactedContacts(this.config.parallelism)
        if (uncontacted.length < 1 || this.noProgressCounter >= this.config.noProgressLimit) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
            return
        }
        for (const nextPeer of uncontacted) {
            if (this.ongoingClosestPeersRequests.size >= this.config.parallelism) {
                break
            }
            this.ongoingClosestPeersRequests.add(nextPeer.getPeerId().toKey())
            // eslint-disable-next-line promise/catch-or-return
            this.getClosestPeersFromContact(nextPeer)
                .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer.getPeerId(), contacts))
                .catch(() => this.onClosestPeersRequestFailed(nextPeer))
                .finally(() => {
                    this.outgoingClosestPeersRequestsCounter--
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<SortedContactList<RemoteDhtNode>> {
        if (this.config.neighborList.getUncontactedContacts(this.config.parallelism).length < 1) {
            logger.trace('getUncontactedContacts length was 0 in beginning of discovery, this.neighborList.size: '
                + this.config.neighborList.getSize())
            return this.config.neighborList
        }
        await runAndWaitForEvents3<DiscoverySessionEvents>(
            [this.findMoreContacts.bind(this)],
            [[this.emitter, 'discoveryCompleted']],
            timeout
        )
        return this.config.neighborList
    }

    public stop(): void {
        this.stopped = true
        this.emitter.emit('discoveryCompleted')
        this.emitter.removeAllListeners()
    }
}
