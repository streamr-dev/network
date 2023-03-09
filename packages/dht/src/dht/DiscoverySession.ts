import { RpcCommunicator, toProtoRpcClient } from "@streamr/proto-rpc"
import { Logger, runAndWaitForEvents3 } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { v4 } from "uuid"
import { PeerID } from "../helpers/PeerID"
import { PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { DhtRpcServiceClient } from "../proto/packages/dht/protos/DhtRpc.client"
import { SortedContactList } from "./contact/SortedContactList"
import { DhtPeer } from "./DhtPeer"
import { peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface DiscoverySessionConfig {
    neighborList: SortedContactList<DhtPeer>,
    targetId: Uint8Array,
    ownPeerDescriptor: PeerDescriptor,
    serviceId: string,
    rpcCommunicator: RpcCommunicator,
    parallelism: number,
    noProgressLimit: number,
    newContactListener?: (dhtPeer: DhtPeer) => void,
    nodeName?: string
}

export class DiscoverySession {
    public readonly sessionId = v4()

    private stopped = false
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private outgoingClosestPeersRequestsCounter = 0
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly config: DiscoverySessionConfig
    private readonly ownPeerId: PeerID

    constructor(config: DiscoverySessionConfig) {
        this.config = config
        this.ownPeerId = peerIdFromPeerDescriptor(config.ownPeerDescriptor)
    }

    private addNewContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        contacts.forEach((contact) => {
            const dhtPeer = new DhtPeer(
                this.config.ownPeerDescriptor,
                contact,
                toProtoRpcClient(new DhtRpcServiceClient(this.config.rpcCommunicator!.getRpcClientTransport())),
                this.config.serviceId
            )
            if (!dhtPeer.getPeerId().equals(this.ownPeerId!)) {
                if (this.config.newContactListener) {
                    this.config.newContactListener(dhtPeer)
                }
                if (!this.config.neighborList.getContact(dhtPeer.getPeerId())) {
                    this.config.neighborList!.addContact(dhtPeer)
                }
            }
        })
    }

    private async getClosestPeersFromContact(contact: DhtPeer): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${contact.getPeerId().toKey()}`)
        this.outgoingClosestPeersRequestsCounter++
        this.config.neighborList!.setContacted(contact.getPeerId())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.neighborList!.setActive(contact.getPeerId())
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (!this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peerId.toKey())
        const oldClosestContact = this.config.neighborList!.getClosestContactId()
        this.addNewContacts(contacts)
        if (this.config.neighborList!.getClosestContactId().equals(oldClosestContact)) {
            this.noProgressCounter++
        } else {
            this.noProgressCounter = 0
        }
    }

    private onClosestPeersRequestFailed(peer: DhtPeer, _exception: Error) {
        if (!this.ongoingClosestPeersRequests.has(peer.getPeerId().toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peer.getPeerId().toKey())
        this.config.neighborList!.removeContact(peer.getPeerId())
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = this.config.neighborList!.getUncontactedContacts(this.config.parallelism)
        if (uncontacted.length < 1 || this.noProgressCounter >= this.config.noProgressLimit) {
            this.emitter.emit('discoveryCompleted')
            this.stopped = true
            return
        }
        for (const nextPeer of uncontacted) {
            if (this.ongoingClosestPeersRequests.size >= this.config.parallelism) {
                break
            }
            this.ongoingClosestPeersRequests.add(nextPeer!.getPeerId().toKey())
            // eslint-disable-next-line promise/catch-or-return
            this.getClosestPeersFromContact(nextPeer!)
                .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer!.getPeerId(), contacts))
                .catch((err) => this.onClosestPeersRequestFailed(nextPeer!, err))
                .finally(() => {
                    this.outgoingClosestPeersRequestsCounter--
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<SortedContactList<DhtPeer>> {
        if (this.config.neighborList!.getUncontactedContacts(this.config.parallelism).length < 1) {
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
    }
}
