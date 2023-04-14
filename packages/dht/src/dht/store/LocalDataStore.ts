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

export class LocalDataStore {
    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // PeerID of the storer of the data
    private store: Map<PeerIDKey, Map<PeerIDKey, LocalDataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): void {
        const publisherKey = PeerID.fromValue(dataEntry.storer!.kademliaId!).toKey()
        const dataKey = PeerID.fromValue(dataEntry.kademliaId).toKey()
        
        if (!this.store.has(dataKey)) {
            this.store.set(dataKey, new Map())
        }

        if (this.store.get(dataKey)!.has(publisherKey)) {
            const storedMillis = (dataEntry.storedAt!.seconds * 1000) + (dataEntry.storedAt!.nanos / 1000000)
            const oldLocalEntry = this.store.get(dataKey)!.get(publisherKey)!
            const oldStoredMillis = (oldLocalEntry.dataEntry.storedAt!.seconds * 1000) + (oldLocalEntry.dataEntry.storedAt!.nanos / 1000000)
        
            // do nothing if old entry is newer than the one being migrated
            if (oldStoredMillis > storedMillis) {
                return
            } else {
                clearTimeout(oldLocalEntry.ttlTimeout)
            }
        }
        this.store.get(dataKey)!.set(publisherKey, {
            dataEntry,
            ttlTimeout: setTimeout(() => {
                this.deleteEntry(PeerID.fromValue(dataEntry.kademliaId), dataEntry.storer!)
            }, createTtlValue(dataEntry.ttl))
        })
    }

    public getStore(): Map<PeerIDKey, Map<PeerIDKey, LocalDataEntry>> {
        return this.store
    }

    public getEntry(key: PeerID): Map<PeerIDKey, DataEntry> | undefined {
        if (!this.store.has(key.toKey())) {
            return undefined
        }
        const dataEntries = new Map<PeerIDKey, DataEntry>
        this.store.get(key.toKey())?.forEach((value, key) => {
            dataEntries.set(key, value.dataEntry)
        })
        return dataEntries
    }

    public deleteEntry(key: PeerID, storer: PeerDescriptor): void {
        const storerKey = keyFromPeerDescriptor(storer)
        const storedEntry = this.store.get(key.toKey())?.get(storerKey)
        if (storedEntry) {
            clearTimeout(storedEntry.ttlTimeout)
            this.store.get(key.toKey())?.delete(storerKey)
            if (this.store.get(key.toKey())?.size === 0) {
                this.store.delete(key.toKey())
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
