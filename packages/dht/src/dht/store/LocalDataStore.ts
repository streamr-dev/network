import { DataEntry } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtAddress, toDhtAddress } from '../../identifiers'
import { MapWithTtl } from '@streamr/utils'

export class LocalDataStore {
    private readonly maxTtl: number

    constructor(maxTtl: number) {
        this.maxTtl = maxTtl
    }

    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // DhtAddress of the creator of the data
    private store: Map<DhtAddress, MapWithTtl<DhtAddress, DataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): boolean {
        const key = toDhtAddress(dataEntry.key)
        const creatorNodeId = toDhtAddress(dataEntry.creator)
        if (!this.store.has(key)) {
            this.store.set(key, new MapWithTtl((e) => Math.min(e.ttl, this.maxTtl)))
        }
        if (this.store.get(key)!.has(creatorNodeId)) {
            const storedMillis = dataEntry.createdAt!.seconds * 1000 + dataEntry.createdAt!.nanos / 1000000
            const oldLocalEntry = this.store.get(key)!.get(creatorNodeId)!
            const oldStoredMillis = oldLocalEntry.createdAt!.seconds * 1000 + oldLocalEntry.createdAt!.nanos / 1000000
            // do nothing if old entry is newer than the one being replicated
            if (oldStoredMillis >= storedMillis) {
                return false
            }
        }
        this.store.get(key)!.set(creatorNodeId, dataEntry)
        return true
    }

    public markAsDeleted(key: DhtAddress, creator: DhtAddress): boolean {
        const item = this.store.get(key)
        if (!item?.has(creator)) {
            return false
        }
        const storedEntry = item.get(creator)
        storedEntry!.deleted = true
        return true
    }

    public *values(key?: DhtAddress): IterableIterator<DataEntry> {
        if (key !== undefined) {
            const map = this.store.get(key)
            if (map !== undefined) {
                yield* map.values()
            }
        } else {
            for (const v of this.store.values()) {
                yield* v.values()
            }
        }
    }

    public keys(): IterableIterator<DhtAddress> {
        return this.store.keys()
    }

    public setAllEntriesAsStale(key: DhtAddress): void {
        this.store.get(key)?.forEach((value) => {
            value.stale = true
        })
    }

    public deleteEntry(key: DhtAddress, creator: DhtAddress): void {
        const storedEntry = this.store.get(key)?.get(creator)
        if (storedEntry) {
            this.store.get(key)?.delete(creator)
            if (this.store.get(key)?.size() === 0) {
                this.store.delete(key)
            }
        }
    }

    public clear(): void {
        this.store.forEach((value) => value.clear())
        this.store.clear()
    }
}
