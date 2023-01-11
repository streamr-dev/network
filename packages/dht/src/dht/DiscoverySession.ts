import { RpcCommunicator, toProtoRpcClient } from "@streamr/proto-rpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { v4 } from "uuid"
import { PeerID } from "../helpers/PeerID"
import { runAndWaitForEvents3 } from "../helpers/waitForEvent3"
import { PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { DhtRpcServiceClient } from "../proto/packages/dht/protos/DhtRpc.client"
import { SortedContactList } from "./contact/SortedContactList"
import { DhtPeer } from "./DhtPeer"

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

export class DiscoverySession {
    public readonly sessionId = v4()

    private stopped = false
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private outgoingClosestPeersRequestsCounter = 0
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<string> = new Set()

    constructor(
        private neighborList: SortedContactList<DhtPeer>,
        private targetId: Uint8Array,
        private ownPeerDescriptor: PeerDescriptor,
        private serviceId: string,
        private rpcCommunicator: RpcCommunicator,
        private parallelism: number,
        private noProgressLimit: number,
        private newContactListener?: (dhtPeer: DhtPeer) => void,
        private nodeName?: string
    ) {
    }

    private get ownPeerId(): PeerID {
        return PeerID.fromValue(this.ownPeerDescriptor.kademliaId)
    }

    /*
    private isDiscoveryCompleted(): boolean {
        return (this.neighborList!.getUncontactedContacts(this.parallelism).length < 1
            || this.noProgressCounter >= this.noProgressLimit)
    }
    */

    private addNewContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }

        contacts.forEach((contact) => {
            const dhtPeer = new DhtPeer(
                this.ownPeerDescriptor,
                contact,
                toProtoRpcClient(new DhtRpcServiceClient(this.rpcCommunicator!.getRpcClientTransport())),
                this.serviceId
            )

            if (!dhtPeer.peerId.equals(this.ownPeerId!)) {
                if (this.newContactListener) {
                    this.newContactListener(dhtPeer)
                }
                if (!this.neighborList.getContact(dhtPeer.peerId)) {
                    this.neighborList!.addContact(dhtPeer)
                }
            }
        })
    }

    private async getClosestPeersFromContact(contact: DhtPeer): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${contact.peerId.toKey()}`)
        this.outgoingClosestPeersRequestsCounter++
        this.neighborList!.setContacted(contact.peerId)
        const returnedContacts = await contact.getClosestPeers(this.targetId)
        this.neighborList!.setActive(contact.peerId)
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            this.ongoingClosestPeersRequests.delete(peerId.toKey())

            const oldClosestContact = this.neighborList!.getClosestContactId()

            this.addNewContacts(contacts)

            if (this.neighborList!.getClosestContactId().equals(oldClosestContact)) {
                this.noProgressCounter++
            } else {
                this.noProgressCounter = 0
            }

            /*
            if (!this.stopped && this.isDiscoveryCompleted()) {
                this.emitter.emit('discoveryCompleted')
                this.stop()
            }*/

        }
    }

    private onClosestPeersRequestFailed(peer: DhtPeer, exception: Error) {
        if (this.ongoingClosestPeersRequests.has(peer.peerId.toKey())) {
            this.ongoingClosestPeersRequests.delete(peer.peerId.toKey())
            logger.error('IL ' + this.nodeName + 'onClosestPeersRequestFailed: ' +
                JSON.stringify(exception) + ' to ' + JSON.stringify(peer.getPeerDescriptor()))
            this.neighborList!.removeContact(peer.peerId)
            //this.findMoreContacts()
        }
    }

    private findMoreContacts(): void {
        if (!this.stopped) {

            if (this.neighborList!.getUncontactedContacts(this.parallelism).length < 1
                || this.noProgressCounter >= this.noProgressLimit) {
                this.emitter.emit('discoveryCompleted')
                this.stopped = true
                return
            }

            const uncontacted = this.neighborList!.getUncontactedContacts(this.parallelism)
            while (this.ongoingClosestPeersRequests.size < this.parallelism && uncontacted.length > 0) {
                const nextPeer = uncontacted.shift()
                this.ongoingClosestPeersRequests.add(nextPeer!.peerId.toKey())
                // eslint-disable-next-line promise/catch-or-return
                this.getClosestPeersFromContact(nextPeer!)
                    .then((contacts) => this.onClosestPeersRequestSucceeded(nextPeer!.peerId, contacts))
                    .catch((err) => {
                        this.onClosestPeersRequestFailed(nextPeer!, err)
                    })
                    .finally(() => {
                        this.outgoingClosestPeersRequestsCounter--

                        this.findMoreContacts()
                        /*
                        if (this.stopped) {
                            this.emitter.emit('discoveryCompleted')
                        } else if (this.outgoingClosestPeersRequestsCounter === 0) {
                            if (this.isDiscoveryCompleted()) {
                                this.emitter.emit('discoveryCompleted')
                                this.stop()
                            } else {
                                this.findMoreContacts()
                            }
                        }*/

                    })
            }
        }
    }

    public async findClosestNodes(timeout: number): Promise<SortedContactList<DhtPeer>> {
        if (this.neighborList!.getUncontactedContacts(this.parallelism).length < 1) {
            logger.error('IL ' + this.nodeName + 'getUncontactedContacts length was 0 in beginning of discovery, this.neighborList.size: ' +
                this.neighborList.getSize())
        }
        await runAndWaitForEvents3<DiscoverySessionEvents>([() => { this.findMoreContacts() }], [
            [this.emitter, 'discoveryCompleted']], timeout)

        return this.neighborList
    }

    public stop(): void {
        this.stopped = true
        this.emitter.emit('discoveryCompleted')
    }
}
