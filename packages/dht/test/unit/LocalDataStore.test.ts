import { Any } from '../../src/proto/google/protobuf/any'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import {
    isSamePeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../src/helpers/peerIdFromPeerDescriptor'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { wait } from '@streamr/utils'
import { Timestamp } from '../../src/proto/google/protobuf/timestamp'

describe('LocalDataStore', () => {
    let localDataStore: LocalDataStore
    const storer1: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 2, 3]),
        type: NodeType.NODEJS,
        nodeName: 'storer1'
    }
    const storer2: PeerDescriptor = {
        kademliaId: new Uint8Array([3, 2, 1]),
        type: NodeType.NODEJS,
        nodeName: 'storer2'
    }
    const data1 = Any.pack(storer1, PeerDescriptor)
    const data2 = Any.pack(storer2, PeerDescriptor)

    beforeEach(() => {
        localDataStore = new LocalDataStore()
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1, 
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(isSamePeerDescriptor(fetchedDescriptor, storer1)).toBeTrue()
        })
    })

    it('multiple storers behind one key', () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        localDataStore.storeEntry({ storer: storer2, kademliaId: dataKey.value, 
            data: data1, ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(isSamePeerDescriptor(fetchedDescriptor, storer1)).toBeTrue()
        })
    })

    it('can remove data entries', () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        localDataStore.storeEntry({ storer: storer2, kademliaId: dataKey.value, data: data2,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        localDataStore.deleteEntry(dataKey, storer1)
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData!.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(isSamePeerDescriptor(fetchedDescriptor, storer2)).toBeTrue()
        })
    })

    it('can remove all data entries', () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        localDataStore.storeEntry({ storer: storer2, kademliaId: dataKey.value, data: data2,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        localDataStore.deleteEntry(dataKey, storer1)
        localDataStore.deleteEntry(dataKey, storer2)
        const fetchedData = localDataStore.getEntry(dataKey)
        expect(fetchedData.size).toBe(0)
    })

    it('data is deleted after TTL', async () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1,
            ttl: 1000, stale: false, deleted: false, storerTime: Timestamp.now() })
        const intitialStore = localDataStore.getEntry(dataKey)
        expect(intitialStore.size).toBe(1)
        await wait(1100)
        const fetchedData = localDataStore.getEntry(dataKey)
        expect(fetchedData.size).toBe(0)
    })

    it('can mark data as deleted', () => {
        const dataKey = peerIdFromPeerDescriptor(storer1)
        localDataStore.storeEntry({ storer: storer1, kademliaId: dataKey.value, data: data1,
            ttl: 10000, stale: false, deleted: false, storerTime: Timestamp.now() })
        const notDeletedData = localDataStore.getEntry(dataKey)
        expect(notDeletedData.get(keyFromPeerDescriptor(storer1))!.deleted).toBeFalse()
        localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(storer1))
        const deletedData = localDataStore.getEntry(dataKey)
        expect(deletedData.get(keyFromPeerDescriptor(storer1))!.deleted).toBeTrue()
    })

})
