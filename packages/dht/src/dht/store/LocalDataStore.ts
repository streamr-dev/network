import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry } from '../../proto/packages/dht/protos/DhtRpc'
import { MapWithTtl } from '../../helpers/MapWithTtl'

const MIN_TTL = 1 * 1000
const MAX_TTL = 300 * 1000

const createTtl = (entry: DataEntry): number => {
    const ttl = entry.ttl
    if (ttl < MIN_TTL) {
        return MIN_TTL
    } else if (ttl > MAX_TTL) {
        return MAX_TTL
    } else {
        return ttl
    }
}

type Key = Uint8Array

export class LocalDataStore {
    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // PeerID of the creator of the data
    private store: Map<PeerIDKey, MapWithTtl<PeerIDKey, DataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): boolean {
        const dataKey = PeerID.fromValue(dataEntry.key).toKey()
        const creatorKey = PeerID.fromValue(dataEntry.creator!.nodeId).toKey()
        if (!this.store.has(dataKey)) {
            this.store.set(dataKey, new MapWithTtl(createTtl))
        }
        if (this.store.get(dataKey)!.has(creatorKey)) {
            const storedMillis = (dataEntry.createdAt!.seconds * 1000) + (dataEntry.createdAt!.nanos / 1000000)
            const oldLocalEntry = this.store.get(dataKey)!.get(creatorKey)!
            const oldStoredMillis = (oldLocalEntry.createdAt!.seconds * 1000) + (oldLocalEntry.createdAt!.nanos / 1000000)
            // do nothing if old entry is newer than the one being replicated
            if (oldStoredMillis >= storedMillis) {
                return false
            }
        }
        this.store.get(dataKey)!.set(creatorKey, dataEntry)
        return true
    }

    public markAsDeleted(key: Key, creator: PeerID): boolean {
        const dataKey = PeerID.fromValue(key).toKey()
        const item = this.store.get(dataKey)
        if ((item === undefined) || !item.has(creator.toKey())) {
            return false
        }
        const storedEntry = item.get(creator.toKey())
        storedEntry!.deleted = true
        return true
    }

    public* values(): IterableIterator<DataEntry> {
        for (const v of this.store.values()) {
            yield* v.values()
        }
    }

    public getEntries(key: Key): Map<PeerIDKey, DataEntry> {
        const dataEntries = new Map<PeerIDKey, DataEntry>
        const mapKey = PeerID.fromValue(key).toKey()
        this.store.get(mapKey)?.forEach((value, key) => {
            dataEntries.set(key, value)
        })
        return dataEntries
    }

    public setStale(key: Key, creator: PeerID, stale: boolean): void {
        const mapKey = PeerID.fromValue(key).toKey()
        const creatorKey = creator.toKey()
        const storedEntry = this.store.get(mapKey)?.get(creatorKey)
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

    public deleteEntry(key: Key, creator: PeerID): void {
        const mapKey = PeerID.fromValue(key).toKey()
        const creatorKey = creator.toKey()
        const storedEntry = this.store.get(mapKey)?.get(creatorKey)
        if (storedEntry) {
            this.store.get(mapKey)?.delete(creatorKey)
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
