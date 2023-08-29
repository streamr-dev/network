import { keyFromPeerDescriptor, PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { sample } from 'lodash'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { EventEmitter } from 'eventemitter3'
import { NodeID } from '../identifiers'

export interface Events {
    peerAdded: (id: NodeID, remote: RemoteRandomGraphNode) => any
}

const getValuesOfIncludedKeys = (peers: Map<NodeID, RemoteRandomGraphNode>, exclude: NodeID[]): RemoteRandomGraphNode[] => {
    return Array.from(peers.entries())
        .filter(([id, _peer]) => !exclude.includes(id))
        .map(([_id, peer]) => peer)
}

export class PeerList extends EventEmitter<Events> {
    private readonly peers: Map<NodeID, RemoteRandomGraphNode>
    private readonly limit: number
    private ownPeerID: PeerID

    constructor(ownPeerId: PeerID, limit: number) {
        super()
        this.peers = new Map()
        this.limit = limit
        this.ownPeerID = ownPeerId
    }

    add(remote: RemoteRandomGraphNode): void {
        if (!this.ownPeerID.equals(peerIdFromPeerDescriptor(remote.getPeerDescriptor())) && this.peers.size < this.limit) {
            const stringId = keyFromPeerDescriptor(remote.getPeerDescriptor()) as unknown as NodeID
            const isExistingPeer = this.peers.has(stringId)
            this.peers.set(stringId, remote)
            
            if (!isExistingPeer) {
                this.emit('peerAdded', stringId, remote)
            }
        }
    }

    remove(peerDescriptor: PeerDescriptor): void {
        this.peers.delete(keyFromPeerDescriptor(peerDescriptor) as unknown as NodeID)
    }

    removeById(stringId: NodeID): void {
        this.peers.delete(stringId)
    }

    hasPeer(peerDescriptor: PeerDescriptor): boolean {
        return this.peers.has(keyFromPeerDescriptor(peerDescriptor) as unknown as NodeID)
    }

    hasPeerWithStringId(stringId: NodeID): boolean {
        return this.peers.has(stringId)
    }

    replaceAll(neighbors: RemoteRandomGraphNode[]): void {
        this.peers.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getStringIds(): NodeID[] {
        return Array.from(this.peers.keys())
    }

    getNeighborById(id: NodeID): RemoteRandomGraphNode | undefined {
        return this.peers.get(id)
    }

    size(exclude: NodeID[] = []): number {
        return Array.from(this.peers.keys()).filter((peer) => !exclude.includes(peer)).length
    }

    getRandom(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        return sample(getValuesOfIncludedKeys(this.peers, exclude))
    }

    getClosest(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        const included = getValuesOfIncludedKeys(this.peers, exclude)
        return included[0]
    }

    getClosestAndFurthest(exclude: NodeID[]): RemoteRandomGraphNode[] {
        const included = getValuesOfIncludedKeys(this.peers, exclude)
        if (included.length === 0) {
            return []
        }
        return included.length > 1 ? [this.getClosest(exclude)!, this.getFurthest(exclude)!] : [this.getClosest(exclude)!]
    }

    getFurthest(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        const included = getValuesOfIncludedKeys(this.peers, exclude)
        return included[included.length - 1]
    }

    getPeers(): RemoteRandomGraphNode[] {
        return Array.from(this.peers.values())
    }

    stop(): void {
        this.peers.clear()
        this.removeAllListeners()
    }
}
