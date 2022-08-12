import { PeerDescriptor, PeerID } from '@streamr/dht'
import { shuffle } from 'lodash'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'

export class NodeNeighbors {
    private readonly neighbors: Map<string, RemoteRandomGraphNode>
    private readonly limit: number

    constructor(limit: number) {
        this.neighbors = new Map()
        this.limit = limit
    }

    add(remote: RemoteRandomGraphNode): void {
        const stringId = this.toStringId(remote.getPeerDescriptor())
        this.neighbors.set(stringId, remote)
    }

    remove(peerDescriptor: PeerDescriptor): void {
        const stringId = this.toStringId(peerDescriptor)
        this.neighbors.delete(stringId)
    }

    removeById(stringId: string): void {
        this.neighbors.delete(stringId)
    }

    hasNeighbor(peerDescriptor: PeerDescriptor): boolean {
        const stringId = this.toStringId(peerDescriptor)
        return this.neighbors.has(stringId)
    }

    hasNeighborWithStringId(stringId: string): boolean {
        return this.neighbors.has(stringId)
    }

    replaceAll(neighbors: RemoteRandomGraphNode[]): void {
        this.neighbors.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getStringIds(): string[] {
        return [...this.neighbors.keys()]
    }

    getNeighborWithId(id: string): RemoteRandomGraphNode | undefined {
        return this.neighbors.get(id)
    }

    private toStringId(peerDescriptor: PeerDescriptor): string {
        return PeerID.fromValue(peerDescriptor.peerId).toMapKey()
    }

    size(): number {
        return this.neighbors.size
    }

    getRandom(): RemoteRandomGraphNode | undefined {
        const keys = [...this.neighbors.keys()]
        const shuffled = shuffle(keys)
        if (shuffled.length) {
            return this.neighbors.get(shuffled[0])
        }
        return undefined
    }

    getClosest(exclude: string[]): RemoteRandomGraphNode | undefined {
        const excluded = new Map<string, RemoteRandomGraphNode>()
        this.neighbors.forEach((val, key) => {
            if (!exclude.includes(key)) {
                excluded.set(key, val)
            }
        })
        if (excluded.size === 0) {
            return undefined
        }
        return excluded.get([...excluded.keys()][0])
    }

    getClosestAndFurthest(exclude: string[]): RemoteRandomGraphNode[] {
        const excluded: RemoteRandomGraphNode[] = []
        this.neighbors.forEach((val, key) => {
            if (!exclude.includes(key)) {
                excluded.push(val)
            }
        })
        if (excluded.length === 0) {
            return []
        } else if (excluded.length > 1) {
            const toReturn = [excluded[0], excluded[excluded.length - 1]]
            return toReturn.filter((contact) => contact)
        } else {
            return [excluded[0]]
        }
    }

    getFurthest(exclude: string[]): RemoteRandomGraphNode | undefined {
        const excluded = new Map<string, RemoteRandomGraphNode>()
        this.neighbors.forEach((val, key) => {
            if (!exclude.includes(key)) {
                excluded.set(key, val)
            }
        })
        if (excluded.size === 0) {
            return undefined
        }
        return excluded.get([...excluded.keys()][excluded.size - 1])
    }

    clear(): void {
        this.neighbors.clear()
    }

    values(): RemoteRandomGraphNode[] {
        return [...this.neighbors.values()]
    }

    getNeighborByStringId(id: string): RemoteRandomGraphNode | undefined {
        return this.neighbors.get(id)
    }
}
