import { PeerDescriptor, PeerID } from '@streamr/dht'
import { shuffle } from 'lodash'
import { RemoteRandomGraphNode } from './RemoteRandomGraphNode'

export class PeerList {
    private readonly peers: Map<string, RemoteRandomGraphNode>
    private readonly limit: number

    constructor(limit: number) {
        this.peers = new Map()
        this.limit = limit
    }

    add(remote: RemoteRandomGraphNode): void {
        if (this.peers.size < this.limit) {
            const stringId = this.toStringId(remote.getPeerDescriptor())
            this.peers.set(stringId, remote)
        }
    }

    remove(peerDescriptor: PeerDescriptor): void {
        const stringId = this.toStringId(peerDescriptor)
        this.peers.delete(stringId)
    }

    removeById(stringId: string): void {
        this.peers.delete(stringId)
    }

    hasPeer(peerDescriptor: PeerDescriptor): boolean {
        const stringId = this.toStringId(peerDescriptor)
        return this.peers.has(stringId)
    }

    hasPeerWithStringId(stringId: string): boolean {
        return this.peers.has(stringId)
    }

    replaceAll(neighbors: RemoteRandomGraphNode[]): void {
        this.peers.clear()
        const limited = neighbors.splice(0, this.limit)
        limited.forEach((remote) => {
            this.add(remote)
        })
    }

    getStringIds(): string[] {
        return [...this.peers.keys()]
    }

    getNeighborWithId(id: string): RemoteRandomGraphNode | undefined {
        return this.peers.get(id)
    }

    private toStringId(peerDescriptor: PeerDescriptor): string {
        return PeerID.fromValue(peerDescriptor.peerId).toKey()
    }

    size(): number {
        return this.peers.size
    }

    getRandom(): RemoteRandomGraphNode | undefined {
        const keys = [...this.peers.keys()]
        const shuffled = shuffle(keys)
        if (shuffled.length) {
            return this.peers.get(shuffled[0])
        }
        return undefined
    }

    getClosest(exclude: string[]): RemoteRandomGraphNode | undefined {
        const excluded = new Map<string, RemoteRandomGraphNode>()
        this.peers.forEach((val, key) => {
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
        this.peers.forEach((val, key) => {
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
        this.peers.forEach((val, key) => {
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
        this.peers.clear()
    }

    values(): RemoteRandomGraphNode[] {
        return [...this.peers.values()]
    }

    getNeighborByStringId(id: string): RemoteRandomGraphNode | undefined {
        return this.peers.get(id)
    }
}
