import { DhtAddress } from '@streamr/dht'
export class PausedNeighbors {
    private readonly pausedNeighbors: Map<string, Set<DhtAddress>>
    private readonly limit: number

    constructor(limit: number) {
        this.pausedNeighbors = new Map()
        this.limit = limit
    }

    add(node: DhtAddress, msgChainId: string): void {
        if (!this.pausedNeighbors.has(msgChainId)) {
            this.pausedNeighbors.set(msgChainId, new Set())
        }
        if (this.pausedNeighbors.get(msgChainId)!.size >= this.limit) {
            return
        }
        this.pausedNeighbors.get(msgChainId)!.add(node)
    }

    delete(node: DhtAddress, msgChainId: string): void {
        this.pausedNeighbors.get(msgChainId)?.delete(node)
        if (this.pausedNeighbors.get(msgChainId)?.size === 0) {
            this.pausedNeighbors.delete(msgChainId)
        }
    }

    deleteAll(node: DhtAddress): void {
        this.pausedNeighbors.forEach((neighbors, msgChainId) => {
            neighbors.delete(node)
            if (neighbors.size === 0) {
                this.pausedNeighbors.delete(msgChainId)
            }
        })
    }

    isPaused(node: DhtAddress, msgChainId: string): boolean {
        if (!this.pausedNeighbors.has(msgChainId)) {
            return false
        }
        return this.pausedNeighbors.get(msgChainId)!.has(node)
    }
    
    forEach(fn: (neighbors: Set<DhtAddress>, msgChainId: string) => void): void {
        this.pausedNeighbors.forEach((neighbors, msgChainId) => {
            fn(neighbors, msgChainId)
        })
    }   
    
}
