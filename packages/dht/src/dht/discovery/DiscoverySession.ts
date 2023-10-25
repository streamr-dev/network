import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { IPeerManager } from '../IPeerManager'
import { RemoteDhtNode } from '../RemoteDhtNode'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

interface DiscoverySessionEvents {
    discoveryCompleted: () => void
}

interface DiscoverySessionConfig {
    targetId: Uint8Array
    parallelism: number
    noProgressLimit: number
    nodeName?: string
    peerManager: IPeerManager
}

export class DiscoverySession {
    public readonly sessionId = v4()

    private stopped = false
    private emitter = new EventEmitter<DiscoverySessionEvents>()
    private outgoingClosestPeersRequestsCounter = 0
    private noProgressCounter = 0
    private ongoingClosestPeersRequests: Set<string> = new Set()
    private readonly config: DiscoverySessionConfig
    private contactedPeers: Set<PeerIDKey> = new Set()
    private joiningPath: Array<string> = [] 

    constructor(config: DiscoverySessionConfig) {
        this.config = config
    }

    private addNewContacts(contacts: PeerDescriptor[]): void {
        if (this.stopped) {
            return
        }
        this.config.peerManager.handleNewPeers(contacts)
    }

    private async getClosestPeersFromContact(contact: RemoteDhtNode): Promise<PeerDescriptor[]> {
        if (this.stopped) {
            return []
        }
        logger.trace(`Getting closest peers from contact: ${keyFromPeerDescriptor(contact.getPeerDescriptor())}`)
        this.outgoingClosestPeersRequestsCounter++

        this.contactedPeers.add(contact.getPeerId().toKey())
        const returnedContacts = await contact.getClosestPeers(this.config.targetId)
        this.config.peerManager.handlePeerActive(contact)
        return returnedContacts
    }

    private onClosestPeersRequestSucceeded(peerId: PeerID, contacts: PeerDescriptor[]) {
        if (!this.ongoingClosestPeersRequests.has(peerId.toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peerId.toKey())

        const oldClosestContact = this.config.peerManager.getClosestPeersTo(this.config.targetId, 1)[0]
        const oldClosestDistance = this.config.peerManager.getDistance(this.config.targetId, oldClosestContact.getPeerId().value)

        this.addNewContacts(contacts)

        const newClosestContact = this.config.peerManager.getClosestPeersTo(this.config.targetId, 1)[0]        
        const newClosestDistance = this.config.peerManager.getDistance(this.config.targetId, newClosestContact.getPeerId().value)
        
        if (newClosestDistance >= oldClosestDistance) {
            this.noProgressCounter++
        } else {
            this.noProgressCounter = 0
        }
    }

    private onClosestPeersRequestFailed(peer: RemoteDhtNode, _exception: Error) {
        if (!this.ongoingClosestPeersRequests.has(peer.getPeerId().toKey())) {
            return
        }
        this.ongoingClosestPeersRequests.delete(peer.getPeerId().toKey())

        this.config.peerManager.handlePeerUnresponsive(peer)
    }

    private findMoreContacts(): void {
        if (this.stopped) {
            return
        }
        const uncontacted = this.config.peerManager.getClosestPeersTo(this.config.targetId, this.config.parallelism, this.contactedPeers)

        if (uncontacted.length < 1 || this.noProgressCounter >= this.config.noProgressLimit) {
            logger.trace( this.config.nodeName + ' discoveryCompleted in findMoreContacts, path: ' + this.joiningPath.join(', '))
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
            this.getClosestPeersFromContact(nextPeer!)
                .then((contacts) => {
                    this.onClosestPeersRequestSucceeded(nextPeer!.getPeerId(), contacts)
                })
                .catch((err) => this.onClosestPeersRequestFailed(nextPeer!, err))
                .finally(() => {
                    this.outgoingClosestPeersRequestsCounter--
                    this.findMoreContacts()
                })
        }
    }

    public async findClosestNodes(timeout: number): Promise<void> {
        if (this.config.peerManager.getNumberOfPeers(this.contactedPeers) < 1) {
            return
        }
        await runAndWaitForEvents3<DiscoverySessionEvents>(
            [this.findMoreContacts.bind(this)],
            [[this.emitter, 'discoveryCompleted']],
            timeout
        )
    }

    public stop(): void {
        this.stopped = true
        logger.trace(this.config.nodeName + ' discoveryCompleted in stop, path: ' + this.joiningPath.join(', '))
        this.emitter.emit('discoveryCompleted')
        this.emitter.removeAllListeners()
    }
}
