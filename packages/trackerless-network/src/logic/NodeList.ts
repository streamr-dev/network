import { PeerDescriptor, PeerID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { sample } from 'lodash'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'
import { EventEmitter } from 'eventemitter3'
import { getNodeIdFromPeerDescriptor, NodeID } from '../identifiers'

export interface Events {
    nodeAdded: (id: NodeID, remote: RemoteRandomGraphNode) => any
}

const getValuesOfIncludedKeys = (nodes: Map<NodeID, RemoteRandomGraphNode>, exclude: NodeID[]): RemoteRandomGraphNode[] => {
    return Array.from(nodes.entries())
        .filter(([id, _peer]) => !exclude.includes(id))
        .map(([_id, peer]) => peer)
}

export class NodeList extends EventEmitter<Events> {
    private readonly nodes: Map<NodeID, RemoteRandomGraphNode>
    private readonly limit: number
    private ownPeerID: PeerID

    constructor(ownPeerId: PeerID, limit: number) {
        super()
        this.nodes = new Map()
        this.limit = limit
        this.ownPeerID = ownPeerId
    }

    add(remote: RemoteRandomGraphNode): void {
        if (!this.ownPeerID.equals(peerIdFromPeerDescriptor(remote.getPeerDescriptor())) && this.nodes.size < this.limit) {
            const stringId = getNodeIdFromPeerDescriptor(remote.getPeerDescriptor())
            const isExistingPeer = this.nodes.has(stringId)
            this.nodes.set(stringId, remote)
            
            if (!isExistingPeer) {
                this.emit('nodeAdded', stringId, remote)
            }
        }
    }

    remove(peerDescriptor: PeerDescriptor): void {
        this.nodes.delete(getNodeIdFromPeerDescriptor(peerDescriptor))
    }

    removeById(stringId: NodeID): void {
        this.nodes.delete(stringId)
    }

    hasNode(peerDescriptor: PeerDescriptor): boolean {
        return this.nodes.has(getNodeIdFromPeerDescriptor(peerDescriptor))
    }

    hasNodeWithStringId(stringId: NodeID): boolean {
        return this.nodes.has(stringId)
    }

    replaceAll(neighbors: RemoteRandomGraphNode[]): void {
        this.nodes.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getStringIds(): NodeID[] {
        return Array.from(this.nodes.keys())
    }

    getNeighborById(id: NodeID): RemoteRandomGraphNode | undefined {
        return this.nodes.get(id)
    }

    size(exclude: NodeID[] = []): number {
        return Array.from(this.nodes.keys()).filter((peer) => !exclude.includes(peer)).length
    }

    getRandom(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        return sample(getValuesOfIncludedKeys(this.nodes, exclude))
    }

    getClosest(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        return included[0]
    }

    getClosestAndFurthest(exclude: NodeID[]): RemoteRandomGraphNode[] {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        if (included.length === 0) {
            return []
        }
        return included.length > 1 ? [this.getClosest(exclude)!, this.getFurthest(exclude)!] : [this.getClosest(exclude)!]
    }

    getFurthest(exclude: NodeID[]): RemoteRandomGraphNode | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        return included[included.length - 1]
    }

    getNodes(): RemoteRandomGraphNode[] {
        return Array.from(this.nodes.values())
    }

    stop(): void {
        this.nodes.clear()
        this.removeAllListeners()
    }
}
