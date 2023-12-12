import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry } from '../../proto/packages/dht/protos/DhtRpc'
import { MapWithTtl } from '../../helpers/MapWithTtl'
import { NodeID, getNodeIdFromBinary } from '../../helpers/nodeId'

type Key = Uint8Array

export class LocalDataStore {

    private readonly maxTtl: number

    constructor(maxTtl: number) {
        this.maxTtl = maxTtl
    }

    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // NodeID of the creator of the data
    private store: Map<PeerIDKey, MapWithTtl<NodeID, DataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): boolean {
        const dataKey = PeerID.fromValue(dataEntry.key).toKey()
        const creatorNodeId = getNodeIdFromBinary(dataEntry.creator!)
        if (!this.store.has(dataKey)) {
            this.store.set(dataKey, new MapWithTtl((e) => Math.min(e.ttl, this.maxTtl)))
        }
        if (this.store.get(dataKey)!.has(creatorNodeId)) {
            const storedMillis = (dataEntry.createdAt!.seconds * 1000) + (dataEntry.createdAt!.nanos / 1000000)
            const oldLocalEntry = this.store.get(dataKey)!.get(creatorNodeId)!
            const oldStoredMillis = (oldLocalEntry.createdAt!.seconds * 1000) + (oldLocalEntry.createdAt!.nanos / 1000000)
            // do nothing if old entry is newer than the one being replicated
            if (oldStoredMillis >= storedMillis) {
                return false
            }
        }
        this.store.get(dataKey)!.set(creatorNodeId, dataEntry)
        return true
    }

    public markAsDeleted(key: Key, creator: NodeID): boolean {
        const dataKey = PeerID.fromValue(key).toKey()
        const item = this.store.get(dataKey)
        if ((item === undefined) || !item.has(creator)) {
            return false
        }
        const storedEntry = item.get(creator)
        storedEntry!.deleted = true
        return true
    }

    public* values(): IterableIterator<DataEntry> {
        for (const v of this.store.values()) {
            yield* v.values()
        }
    }

    public getEntries(key: Key): Map<NodeID, DataEntry> {
        const dataEntries = new Map<NodeID, DataEntry>
        const mapKey = PeerID.fromValue(key).toKey()
        this.store.get(mapKey)?.forEach((value, key) => {
            dataEntries.set(key, value)
        })
        return dataEntries
    }

    public setStale(key: Key, creator: NodeID, stale: boolean): void {
        const mapKey = PeerID.fromValue(key).toKey()
        const storedEntry = this.store.get(mapKey)?.get(creator)
        if (storedEntry) {
            storedEntry.stale = stale
        }
    }

    public setAllEntriesAsStale(key: Key): void {
        const mapKey = PeerID.fromValue(key).toKey()
        this.store.get(mapKey)?.forEach((value) => {
            value.stale = true
        })
    }

    public deleteEntry(key: Key, creator: NodeID): void {
        const mapKey = PeerID.fromValue(key).toKey()
        const storedEntry = this.store.get(mapKey)?.get(creator)
        if (storedEntry) {
            this.store.get(mapKey)?.delete(creator)
            if (this.store.get(mapKey)?.size() === 0) {
                this.store.delete(mapKey)
            }
        }
    }

    public clear(): void {
        this.store.forEach((value) => value.clear())
        this.store.clear()
    }
}
