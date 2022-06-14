import { PeerDescriptor, PeerID } from '@streamr/dht'
import { shuffle } from 'lodash'

export class NodeNeighbors {
    private readonly neighbors: Map<string, PeerDescriptor>
    private readonly limit: number

    constructor(limit: number) {
        this.neighbors = new Map()
        this.limit = limit
    }

    add(peerDescriptor: PeerDescriptor): void {
        const stringId = this.toStringId(peerDescriptor)
        this.neighbors.set(stringId, peerDescriptor)
    }

    remove(peerDescriptor: PeerDescriptor): void {
        const stringId = this.toStringId(peerDescriptor)
        this.neighbors.delete(stringId)
    }

    hasNeighbor(peerDescriptor: PeerDescriptor): boolean {
        const stringId = this.toStringId(peerDescriptor)
        return this.neighbors.has(stringId)
    }

    hasNeighborWithStringId(stringId: string): boolean {
        return this.neighbors.has(stringId)
    }

    replaceAll(neighbors: PeerDescriptor[]): void {
        this.neighbors.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((peerDescriptor) => {
            this.add(peerDescriptor)
        })
    }

    getStringIds(): string[] {
        return [...this.neighbors.keys()]
    }

    getNeighborWithId(id: string): PeerDescriptor | undefined {
        return this.neighbors.get(id)
    }

    private toStringId(peerDescriptor: PeerDescriptor): string {
        return PeerID.fromValue(peerDescriptor.peerId).toMapKey()
    }

    size(): number {
        return this.neighbors.size
    }

    getRandom(): PeerDescriptor | undefined {
        const keys = [...this.neighbors.keys()]
        const shuffled = shuffle(keys)
        if (shuffled.length) {
            return this.neighbors.get(shuffled[0])
        }
        return undefined
    }

    clear(): void {
        this.neighbors.clear()
    }
}