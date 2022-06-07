import { PeerDescriptor, PeerID } from '@streamr/dht'

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

    private toStringId(peerDescriptor: PeerDescriptor): string {
        return PeerID.fromValue(peerDescriptor.peerId).toMapKey()
    }
}