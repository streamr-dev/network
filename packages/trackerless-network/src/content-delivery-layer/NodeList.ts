import { DhtAddress, toNodeId } from '@streamr/dht'
import sample from 'lodash/sample'
import { ContentDeliveryRpcRemote } from './ContentDeliveryRpcRemote'
import { EventEmitter } from 'eventemitter3'

export interface Events {
    nodeAdded: (id: DhtAddress, remote: ContentDeliveryRpcRemote) => void
    nodeRemoved: (id: DhtAddress, remote: ContentDeliveryRpcRemote) => void
    nodeListUpdated: () => void
}

const getValuesOfIncludedKeys = (
    nodes: Map<DhtAddress, ContentDeliveryRpcRemote>,
    exclude: DhtAddress[],
    wsOnly = false
): ContentDeliveryRpcRemote[] => {
    const values = wsOnly 
        ? Array.from(nodes.entries()).filter(([_, node]) => node.getPeerDescriptor().websocket !== undefined)
        : Array.from(nodes.entries())
    return values
        .filter(([id]) => !exclude.includes(id))
        .map(([_id, node]) => node)
}

// The items in the list are in the insertion order

export class NodeList extends EventEmitter<Events> {
    private readonly nodes: Map<DhtAddress, ContentDeliveryRpcRemote>
    private readonly limit: number
    private ownId: DhtAddress

    constructor(ownId: DhtAddress, limit: number) {
        super()
        this.nodes = new Map()
        this.limit = limit
        this.ownId = ownId
    }

    private onStatisticsChanged = (): void => {
        this.emit('nodeListUpdated')
    }

    add(remote: ContentDeliveryRpcRemote): void {
        const nodeId = toNodeId(remote.getPeerDescriptor())
        if ((this.ownId !== nodeId) && (this.nodes.size < this.limit)) {
            remote.emitter.on('statisticsChanged', this.onStatisticsChanged)
            const isExistingNode = this.nodes.has(nodeId)
            this.nodes.set(nodeId, remote)
            
            if (!isExistingNode) {
                this.emit('nodeAdded', nodeId, remote)
                this.emit('nodeListUpdated')
            }
        }
    }

    remove(nodeId: DhtAddress): void {
        if (this.nodes.has(nodeId)) {
            const remote = this.nodes.get(nodeId)!
            remote.emitter.off('statisticsChanged', this.onStatisticsChanged)
            this.nodes.delete(nodeId)
            this.emit('nodeRemoved', nodeId, remote)
            this.emit('nodeListUpdated')
        }   
    }

    has(nodeId: DhtAddress): boolean {
        return this.nodes.has(nodeId)
    }

    // Replace nodes does not emit nodeRemoved events, use with caution
    replaceAll(neighbors: ContentDeliveryRpcRemote[]): void {
        this.nodes.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getIds(): DhtAddress[] {
        return Array.from(this.nodes.keys())
    }

    get(id: DhtAddress): ContentDeliveryRpcRemote | undefined {
        return this.nodes.get(id)
    }

    size(exclude: DhtAddress[] = []): number {
        return Array.from(this.nodes.keys()).filter((node) => !exclude.includes(node)).length
    }

    getRandom(exclude: DhtAddress[]): ContentDeliveryRpcRemote | undefined {
        return sample(getValuesOfIncludedKeys(this.nodes, exclude))
    }

    getFirst(exclude: DhtAddress[], wsOnly = false): ContentDeliveryRpcRemote | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude, wsOnly)
        return included[0]
    }

    getFirstAndLast(exclude: DhtAddress[]): ContentDeliveryRpcRemote[] {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        if (included.length === 0) {
            return []
        }
        return included.length > 1 ? [this.getFirst(exclude)!, this.getLast(exclude)!] : [this.getFirst(exclude)!]
    }

    getLast(exclude: DhtAddress[]): ContentDeliveryRpcRemote | undefined {
        const included = getValuesOfIncludedKeys(this.nodes, exclude)
        return included[included.length - 1]
    }

    getAll(): ContentDeliveryRpcRemote[] {
        return Array.from(this.nodes.values())
    }

    stop(): void {
        this.nodes.forEach((node) => this.remove(toNodeId(node.getPeerDescriptor())))
        this.removeAllListeners()
    }

}
