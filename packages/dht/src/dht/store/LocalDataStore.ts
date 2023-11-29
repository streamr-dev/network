import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const MIN_TTL = 1 * 1000
const MAX_TTL = 300 * 1000

const createTtlValue = (ttl: number): number => {
    if (ttl < MIN_TTL) {
        return MIN_TTL
    } else if (ttl > MAX_TTL) {
        return MAX_TTL
    } else {
        return ttl
    }
}

interface LocalDataEntry {
    dataEntry: DataEntry
    ttlTimeout: NodeJS.Timeout
}

type Key = Uint8Array

export class LocalDataStore {
    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // PeerID of the creator of the data
    private store: Map<PeerIDKey, Map<PeerIDKey, LocalDataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): boolean {
        const publisherKey = PeerID.fromValue(dataEntry.creator!.nodeId).toKey()
        const dataKey = PeerID.fromValue(dataEntry.key).toKey()
        
        if (!this.store.has(dataKey)) {
            this.store.set(dataKey, new Map())
        }

        if (this.store.get(dataKey)!.has(publisherKey)) {
            const storedMillis = (dataEntry.createdAt!.seconds * 1000) + (dataEntry.createdAt!.nanos / 1000000)
            const oldLocalEntry = this.store.get(dataKey)!.get(publisherKey)!
            const oldStoredMillis = (oldLocalEntry.dataEntry.createdAt!.seconds * 1000) + (oldLocalEntry.dataEntry.createdAt!.nanos / 1000000)
        
            // do nothing if old entry is newer than the one being replicated
            if (oldStoredMillis >= storedMillis) {
                return false
            } else {
                clearTimeout(oldLocalEntry.ttlTimeout)
            }
        }
        this.store.get(dataKey)!.set(publisherKey, {
            dataEntry,
            ttlTimeout: setTimeout(() => {
                this.deleteEntry(dataEntry.key, dataEntry.creator!)
            }, createTtlValue(dataEntry.ttl))
        })
        return true
    }

    public markAsDeleted(key: Key, creator: PeerID): boolean {
        const dataKey = PeerID.fromValue(key).toKey()
        const item = this.store.get(dataKey)
        if ((item === undefined) || !item.has(creator.toKey())) {
            return false
        }
        const storedEntry = item.get(creator.toKey())
        storedEntry!.dataEntry.deleted = true
        return true
    }

    public getStore(): Map<PeerIDKey, Map<PeerIDKey, LocalDataEntry>> {
        return this.store
    }

    public getEntries(key: Key): Map<PeerIDKey, DataEntry> {
        const dataEntries = new Map<PeerIDKey, DataEntry>
        const mapKey = PeerID.fromValue(key).toKey()
        this.store.get(mapKey)?.forEach((value, key) => {
            dataEntries.set(key, value.dataEntry)
        })
        return dataEntries
    }

    public setStale(key: Key, creator: PeerDescriptor, stale: boolean): void {
        const creatorKey = keyFromPeerDescriptor(creator)
        const mapKey = PeerID.fromValue(key).toKey()
        const storedEntry = this.store.get(mapKey)?.get(creatorKey)
        if (storedEntry) {
            storedEntry.dataEntry.stale = stale
        }
    }

    public setAllEntriesAsStale(key: Key): void {
        const mapKey = PeerID.fromValue(key).toKey()
        this.store.get(mapKey)?.forEach((value) => {
            value.dataEntry.stale = true
        })
    }

    public deleteEntry(key: Key, creator: PeerDescriptor): void {
        const mapKey = PeerID.fromValue(key).toKey()
        const creatorKey = keyFromPeerDescriptor(creator)
        const storedEntry = this.store.get(mapKey)?.get(creatorKey)
        if (storedEntry) {
            clearTimeout(storedEntry.ttlTimeout)
            this.store.get(mapKey)?.delete(creatorKey)
            if (this.store.get(mapKey)?.size === 0) {
                this.store.delete(mapKey)
            }
        }
    }

    public clear(): void {
        this.store.forEach((value) => {
            value.forEach((value) => {
                clearTimeout(value.ttlTimeout)
            })
        })
        this.store.clear()
    }
}
