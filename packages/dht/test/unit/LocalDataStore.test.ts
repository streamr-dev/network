import { wait } from '@streamr/utils'
import crypto from 'crypto'
import { MarkRequired } from 'ts-essentials'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { PeerID } from '../../src/helpers/PeerID'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../src/helpers/peerIdFromPeerDescriptor'
import { Any } from '../../src/proto/google/protobuf/any'
import { Timestamp } from '../../src/proto/google/protobuf/timestamp'
import { DataEntry, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const createMockEntry = (entry: MarkRequired<Partial<DataEntry>, 'creator'>): DataEntry => {
    return { 
        key: crypto.randomBytes(10),
        data: Any.pack(entry.creator, PeerDescriptor),  // TODO use random data, i.e. createMockPeerDescriptor()
        ttl: 10000,
        stale: false,
        deleted: false,
        createdAt: Timestamp.now(),
        ...entry
    }
}

describe('LocalDataStore', () => {

    let localDataStore: LocalDataStore
    const creator1 = createMockPeerDescriptor()
    const creator2 = createMockPeerDescriptor()

    beforeEach(() => {
        localDataStore = new LocalDataStore()
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const storedEntry = createMockEntry({ creator: creator1 })
        localDataStore.storeEntry(storedEntry)
        const fetchedEntries = localDataStore.getEntries(PeerID.fromValue(storedEntry.key))
        fetchedEntries.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator1)).toBeTrue()
        })
    })

    it('multiple storers behind one key', () => {
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2, data: Any.pack(creator1, PeerDescriptor) })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        const fetchedEntries = localDataStore.getEntries(PeerID.fromValue(key))
        fetchedEntries.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator1)).toBeTrue()
        })
    })

    it('can remove data entries', () => {
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator1)
        const fetchedEntries = localDataStore.getEntries(PeerID.fromValue(key))
        fetchedEntries.forEach((entry) => {
            const fetchedDescriptor = Any.unpack(entry.data!, PeerDescriptor)
            expect(areEqualPeerDescriptors(fetchedDescriptor, creator2)).toBeTrue()
        })
    })

    it('can remove all data entries', () => {
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator1)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator2)
        const fetchedEntries = localDataStore.getEntries(PeerID.fromValue(key))
        expect(fetchedEntries.size).toBe(0)
    })

    it('data is deleted after TTL', async () => {
        const storedEntry = createMockEntry({ creator: creator1, ttl: 1000 })
        localDataStore.storeEntry(storedEntry)
        const fethedEntriesBeforeExpiration = localDataStore.getEntries(PeerID.fromValue(storedEntry.key))
        expect(fethedEntriesBeforeExpiration.size).toBe(1)
        await wait(1100)
        const fetchedEntriesAfterExpiration = localDataStore.getEntries(PeerID.fromValue(storedEntry.key))
        expect(fetchedEntriesAfterExpiration.size).toBe(0)
    })

    describe('mark data as deleted', () => {

        it('happy path', () => {
            const storedEntry = createMockEntry({ creator: creator1 })
            localDataStore.storeEntry(storedEntry)
            const notDeletedData = localDataStore.getEntries(PeerID.fromValue(storedEntry.key))
            expect(notDeletedData.get(keyFromPeerDescriptor(creator1))!.deleted).toBeFalse()
            const returnValue = localDataStore.markAsDeleted(storedEntry.key, peerIdFromPeerDescriptor(creator1))
            expect(returnValue).toBe(true)
            const deletedData = localDataStore.getEntries(PeerID.fromValue(storedEntry.key))
            expect(deletedData.get(keyFromPeerDescriptor(creator1))!.deleted).toBeTrue()
        })

        it('data not stored', () => {
            const dataKey = peerIdFromPeerDescriptor(creator1)
            const returnValue = localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(creator2))
            expect(returnValue).toBe(false)
        })

        it('data not stored by the given creator', () => {
            const storedEntry = createMockEntry({ creator: creator1 })
            localDataStore.storeEntry(storedEntry)
            const returnValue = localDataStore.markAsDeleted(storedEntry.key, peerIdFromPeerDescriptor(creator2))
            expect(returnValue).toBe(false)
        })
    })
})
