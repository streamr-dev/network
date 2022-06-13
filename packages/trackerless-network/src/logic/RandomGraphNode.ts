import EventEmitter = require('events')
import { DhtNode, DhtNodeEvent, PeerID, PeerDescriptor, DhtPeer } from '@streamr/dht'
import { DataMessage, Layer2Message } from '../proto/NetworkRpc'
import { NodeNeighbors } from './NodeNeighbors'
import { range } from 'lodash'

export enum Event {
    MESSAGE = 'streamr:layer2:random-graph-node:onmessage'
}

export interface RandomGraphNode {
    on(event: Event.MESSAGE, listener: () => any): this
}

export interface RandomGraphNodeParams {
    randomGraphId: string,
    layer1: DhtNode
}

export type messageListener = (senderDescriptor: PeerDescriptor, msg: Layer2Message) => void

export class RandomGraphNode extends EventEmitter {
    private readonly N = 4
    private readonly PEER_VIEW_SIZE = 10
    private readonly randomGraphId: string // StreamPartID
    private readonly layer1: DhtNode
    private messageListener: messageListener | null = null
    private readonly contactPool: NodeNeighbors
    private readonly selectedNeighbors: NodeNeighbors = new NodeNeighbors(4)
    // private readonly randomNeighbors: PeerDescriptor[] = []

    constructor(params: RandomGraphNodeParams) {
        super()
        this.randomGraphId = params.randomGraphId
        this.layer1 = params.layer1

        this.contactPool = new NodeNeighbors(this.PEER_VIEW_SIZE)
        this.selectedNeighbors = new NodeNeighbors(this.N)
    }

    start(): void {
        this.messageListener = (_sender, _message) => {
            console.log("onMEssage")
        }
        this.layer1.on(DhtNodeEvent.NEW_CONTACT, (peerDescriptor, closestTen) => this.newContact(peerDescriptor, closestTen))
        this.layer1.on(DhtNodeEvent.CONTACT_REMOVED, (peerDescriptor, closestTen) => this.removedContact(peerDescriptor, closestTen))
        const candidates = this.getNewNeighborCandidates()
        if (candidates.length) {
            this.newContact(candidates[0], candidates)
        }
    }

    stop(): void {

    }

    broadcast(_msg: DataMessage): void {

    }

    setMessageListener(listener: messageListener): void {
        this.messageListener = listener
    }

    private newContact(_newContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        const toReplace: string[] = []
        this.contactPool.replaceAll(closestTen)
        this.selectedNeighbors.getStringIds().forEach((neighbor) => {
            if (!this.contactPool.hasNeighborWithStringId(neighbor)) {
                toReplace.push(neighbor)
            }
        })
        this.replaceNeighbors(toReplace)
    }

    private removedContact(removedContact: PeerDescriptor, closestTen: PeerDescriptor[]): void {
        const toReplace: string[] = []
        if (this.selectedNeighbors.hasNeighbor(removedContact)) {
            toReplace.push(PeerID.fromValue(removedContact.peerId).toMapKey())
        }
        this.contactPool.replaceAll(closestTen)
        this.selectedNeighbors.getStringIds().forEach((neighbor) => {
            if (!this.contactPool.hasNeighborWithStringId(neighbor)) {
                toReplace.push(neighbor)
            }
        })
        this.replaceNeighbors(toReplace)
    }

    private async replaceNeighbors(stringIds: string[]): Promise<void> {
        const promises = stringIds.map((replace) => {
            const toReplace = this.selectedNeighbors.getNeighborWithId(replace)
            if (toReplace) {
                this.selectedNeighbors.remove(toReplace)
                this.addRandomContactToNeighbors()
            }
        })
        // Fill up neighbors to N
        if (this.selectedNeighbors.size() < this.N) {
            promises.concat(...range(this.N - this.selectedNeighbors.size()).map(() => {
                this.addRandomContactToNeighbors()
            }))
        }
    }

    private getNewNeighborCandidates(): PeerDescriptor[] {
        return this.layer1.getNeighborList().getActiveContacts(this.PEER_VIEW_SIZE).map((contact: DhtPeer) => {
            return contact.getPeerDescriptor()
        })
    }

    private addRandomContactToNeighbors(): void {
        const newNeighbor = this.contactPool.getRandom()
        if (newNeighbor) {
            // Negotiate Layer 2 connection here if success add as neighbor
            this.selectedNeighbors.add(newNeighbor)
        }
    }

    getSelectedNeighborIds(): string[] {
        return this.selectedNeighbors.getStringIds()
    }

    getContactPoolIds(): string[] {
        return this.contactPool.getStringIds()
    }
}
