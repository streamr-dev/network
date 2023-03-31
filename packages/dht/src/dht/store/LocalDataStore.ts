import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class LocalDataStore {
    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // PeerID of the storer of the data
    public store: Map<PeerIDKey, Map<PeerIDKey, DataEntry>> = new Map()

    public storeEntry(dataEntry: DataEntry): void {
        const publisherKey = PeerID.fromValue(dataEntry.storer!.kademliaId!).toKey()
        const dataKey = PeerID.fromValue(dataEntry.kademliaId).toKey()
        
        if (!this.store.has(dataKey)) {
            this.store.set(dataKey, new Map())
        }

        if (this.store.get(dataKey)!.has(publisherKey)) {
            const storedMillis = (dataEntry.storedAt!.seconds * 1000) + (dataEntry.storedAt!.nanos / 1000000)
            const oldEntry = this.store.get(dataKey)!.get(publisherKey)!
            const oldStoredMillis = (oldEntry.storedAt!.seconds * 1000) + (oldEntry.storedAt!.nanos / 1000000)
        
            // do nothing if old entry is newer than the one being migrated
            if (oldStoredMillis > storedMillis) {
                return
            }
        }

        this.store.get(dataKey)!.set(publisherKey, dataEntry)
    }

    public getEntry(key: PeerID): Map<PeerIDKey, DataEntry> | undefined {
        return this.store.get(key.toKey())
    }

    public deleteEntry(key: PeerID, storer: PeerDescriptor): void {
        const storerKey = keyFromPeerDescriptor(storer)
        this.store.get(key.toKey())?.delete(storerKey)
    }
}
