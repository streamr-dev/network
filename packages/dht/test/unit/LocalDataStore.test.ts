import { Any } from '../../src/proto/google/protobuf/any'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../src/helpers/peerIdFromPeerDescriptor'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { wait } from '@streamr/utils'
import { Timestamp } from '../../src/proto/google/protobuf/timestamp'
import { PeerID } from '../../src/helpers/PeerID'

describe('LocalDataStore', () => {

    let localDataStore: LocalDataStore
    const creator1: PeerDescriptor = {
        nodeId: new Uint8Array([1, 2, 3]),
        type: NodeType.NODEJS
    }
    const creator2: PeerDescriptor = {
        nodeId: new Uint8Array([3, 2, 1]),
        type: NodeType.NODEJS
    }

    const storeEntry = (dataKey: PeerID, creator: PeerDescriptor, explicitData?: PeerDescriptor, explicitTtl?: number) => {
        localDataStore.storeEntry({ creator: creator, key: dataKey.value, data: Any.pack(explicitData ?? creator, PeerDescriptor), ttl: explicitTtl ?? 10000, stale: false, deleted: false, createdAt: Timestamp.now() })
    }

    beforeEach(() => {
        localDataStore = new LocalDataStore()
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const dataKey = peerIdFromPeerDescriptor(creator1)
        storeEntry(dataKey, creator1)
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator1)).toBeTrue()
        })
    })

    it('multiple storers behind one key', () => {
        const dataKey = peerIdFromPeerDescriptor(creator1)
        storeEntry(dataKey, creator1)
        storeEntry(dataKey, creator2, creator1)
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator1)).toBeTrue()
        })
    })

    it('can remove data entries', () => {
        const dataKey = peerIdFromPeerDescriptor(creator1)
        storeEntry(dataKey, creator1)
        storeEntry(dataKey, creator2)
        localDataStore.deleteEntry(dataKey, creator1)
        const fetchedData = localDataStore.getEntry(dataKey)
        fetchedData.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator2)).toBeTrue()
        })
    })

    it('can remove all data entries', () => {
        const dataKey = peerIdFromPeerDescriptor(creator1)
        storeEntry(dataKey, creator1)
        storeEntry(dataKey, creator2)
        localDataStore.deleteEntry(dataKey, creator1)
        localDataStore.deleteEntry(dataKey, creator2)
        const fetchedData = localDataStore.getEntry(dataKey)
        expect(fetchedData.size).toBe(0)
    })

    it('data is deleted after TTL', async () => {
        const dataKey = peerIdFromPeerDescriptor(creator1)
        storeEntry(dataKey, creator1, undefined, 1000)
        const intitialStore = localDataStore.getEntry(dataKey)
        expect(intitialStore.size).toBe(1)
        await wait(1100)
        const fetchedData = localDataStore.getEntry(dataKey)
        expect(fetchedData.size).toBe(0)
    })

    describe('mark data as deleted', () => {

        it('happy path', () => {
            const dataKey = peerIdFromPeerDescriptor(creator1)
            storeEntry(dataKey, creator1)
            const notDeletedData = localDataStore.getEntry(dataKey)
            expect(notDeletedData.get(keyFromPeerDescriptor(creator1))!.deleted).toBeFalse()
            const returnValue = localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(creator1))
            expect(returnValue).toBe(true)
            const deletedData = localDataStore.getEntry(dataKey)
            expect(deletedData.get(keyFromPeerDescriptor(creator1))!.deleted).toBeTrue()
        })

        it('data not stored', () => {
            const dataKey = peerIdFromPeerDescriptor(creator1)
            const returnValue = localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(creator2))
            expect(returnValue).toBe(false)
        })

        it('data not stored by the given creator', () => {
            const dataKey = peerIdFromPeerDescriptor(creator1)
            storeEntry(dataKey, creator1)
            const returnValue = localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(creator2))
            expect(returnValue).toBe(false)
        })
    })
})
