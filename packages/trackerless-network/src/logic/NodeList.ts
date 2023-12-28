import { DhtAddress, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { sample } from 'lodash'
import { DeliveryRpcRemote } from './DeliveryRpcRemote'
import { EventEmitter } from 'eventemitter3'

export interface Events {
    nodeAdded: (id: DhtAddress, remote: DeliveryRpcRemote) => any
}

const getValuesOfIncludedKeys = (nodes: Map<DhtAddress, DeliveryRpcRemote>, exclude: DhtAddress[]): DeliveryRpcRemote[] => {
    return Array.from(nodes.entries())
        .filter(([id, _node]) => !exclude.includes(id))
        .map(([_id, node]) => node)
}

// The items in the list are in the insertion order

export class NodeList extends EventEmitter<Events> {
    private readonly nodes: Map<DhtAddress, DeliveryRpcRemote>
    private readonly limit: number
    private ownId: DhtAddress

    constructor(ownId: DhtAddress, limit: number) {
        super()
        this.nodes = new Map()
        this.limit = limit
        this.ownId = ownId
    }

    add(remote: DeliveryRpcRemote): void {
        const nodeId = getNodeIdFromPeerDescriptor(remote.getPeerDescriptor())
        if ((this.ownId !== nodeId) && (this.nodes.size < this.limit)) {
            const isExistingNode = this.nodes.has(nodeId)
            this.nodes.set(nodeId, remote)
            
            if (!isExistingNode) {
                this.emit('nodeAdded', nodeId, remote)
            }
        }
    }

    remove(peerDescriptor: PeerDescriptor): void {
        this.nodes.delete(getNodeIdFromPeerDescriptor(peerDescriptor))
    }

    removeById(nodeId: DhtAddress): void {
        this.nodes.delete(nodeId)
    }

    hasNode(peerDescriptor: PeerDescriptor): boolean {
        return this.nodes.has(getNodeIdFromPeerDescriptor(peerDescriptor))
    }

    hasNodeById(nodeId: DhtAddress): boolean {
        return this.nodes.has(nodeId)
    }

    replaceAll(neighbors: DeliveryRpcRemote[]): void {
        this.nodes.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getIds(): DhtAddress[] {
        return Array.from(this.nodes.keys())
    }

    get(id: DhtAddress): DeliveryRpcRemote | undefined {
        return this.nodes.get(id)
    }

    size(exclude: DhtAddress[] = []): number {
        return Array.from(this.nodes.keys()).filter((node) => !exclude.includes(node)).length
    }

    getRandom(exclude: DhtAddress[]): DeliveryRpcRemote | undefined {
        return sample(getValuesOfIncludedKeys(this.nodes, exclude))
    }

    getFirst(exclude: DhtAddress[]): DeliveryRpcRemote | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        return included[0]
    }

    getFirstAndLast(exclude: DhtAddress[]): DeliveryRpcRemote[] {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        if (included.length === 0) {
            return []
        }
        return included.length > 1 ? [this.getFirst(exclude)!, this.getLast(exclude)!] : [this.getFirst(exclude)!]
    }

    getLast(exclude: DhtAddress[]): DeliveryRpcRemote | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        return included[included.length - 1]
    }

    getAll(): DeliveryRpcRemote[] {
        return Array.from(this.nodes.values())
    }

    stop(): void {
        this.nodes.clear()
        this.removeAllListeners()
    }
}
