import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Any } from '../../proto/google/protobuf/any'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class LocalDataStore {
    // A map into which each node can store one value per data key
    // The first key is the key of the data, the second key is the
    // PeerID of the storer of the data
    private store: Map<PeerIDKey, Map<PeerIDKey, DataEntry>> = new Map()

    public storeEntry(storer: PeerDescriptor, dataKey: PeerID, data: Any, ttl: number): void {
        const publisherId = PeerID.fromValue(storer.kademliaId)
        if (!this.store.has(dataKey.toKey())) {
            this.store.set(dataKey.toKey(), new Map())
        }
        this.store.get(dataKey.toKey())!.set(publisherId.toKey(), { storer, data, storedAt: Timestamp.now(), ttl })
    }

    public getEntry(key: PeerID): Map<PeerIDKey, DataEntry> | undefined {
        return this.store.get(key.toKey())
    }

    public deleteEntry(key: PeerID, storer: PeerDescriptor): void {
        const storerKey = keyFromPeerDescriptor(storer)
        this.store.get(key.toKey())?.delete(storerKey)
    }
}
