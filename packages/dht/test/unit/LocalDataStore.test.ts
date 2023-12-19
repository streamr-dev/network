import { wait } from '@streamr/utils'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import {
    getNodeIdFromPeerDescriptor,
} from '../../src/helpers/peerIdFromPeerDescriptor'
import { createMockPeerDescriptor } from '../utils/utils'
import { createMockDataEntry, expectEqualData } from '../utils/mock/mockDataEntry'
import { DataKey, createRandomDataKey, createRandomNodeId } from '../../src/identifiers'
import { getDataKeyFromRaw } from '../../src/identifiers'

describe('LocalDataStore', () => {

    let localDataStore: LocalDataStore

    const getEntryArray = (key: DataKey) => {
        return Array.from(localDataStore.getEntries(key).values())
    }
    
    beforeEach(() => {
        localDataStore = new LocalDataStore(30 * 1000)
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const storedEntry = createMockDataEntry()
        localDataStore.storeEntry(storedEntry)
        const fetchedEntries = getEntryArray(getDataKeyFromRaw(storedEntry.key))
        expect(fetchedEntries).toHaveLength(1)
        expectEqualData(fetchedEntries[0], storedEntry)
    })

    it('multiple storers behind one key', () => {
        const creator1 = createRandomNodeId()
        const creator2 = createRandomNodeId()
        const key = createRandomDataKey()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        const fetchedEntries = localDataStore.getEntries(key)
        expect(fetchedEntries.size).toBe(2)
        expectEqualData(fetchedEntries.get(creator1)!, storedEntry1)
        expectEqualData(fetchedEntries.get(creator2)!, storedEntry2)
    })

    it('can remove data entries', () => {
        const creator1 = createRandomNodeId()
        const creator2 = createRandomNodeId()
        const key = createRandomDataKey()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(key, creator1)
        const fetchedEntries = getEntryArray(key)
        expect(fetchedEntries).toHaveLength(1)
        expectEqualData(fetchedEntries[0], storedEntry2)
    })

    it('can remove all data entries', () => {
        const creator1 = createRandomNodeId()
        const creator2 = createRandomNodeId()
        const key = createRandomDataKey()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(key, creator1)
        localDataStore.deleteEntry(key, creator2)
        expect(getEntryArray(key)).toHaveLength(0)
    })

    it('data is deleted after TTL', async () => {
        const storedEntry = createMockDataEntry({ ttl: 1000 })
        localDataStore.storeEntry(storedEntry)
        expect(getEntryArray(getDataKeyFromRaw(storedEntry.key))).toHaveLength(1)
        await wait(1100)
        expect(getEntryArray(getDataKeyFromRaw(storedEntry.key))).toHaveLength(0)
    })

    describe('mark data as deleted', () => {

        it('happy path', () => {
            const creator1 = createRandomNodeId()
            const storedEntry = createMockDataEntry({ creator: creator1 })
            localDataStore.storeEntry(storedEntry)
            const notDeletedData = localDataStore.getEntries(getDataKeyFromRaw(storedEntry.key))
            expect(notDeletedData.get(creator1)!.deleted).toBeFalse()
            const returnValue = localDataStore.markAsDeleted(
                getDataKeyFromRaw(storedEntry.key),
                creator1
            )
            expect(returnValue).toBe(true)
            const deletedData = localDataStore.getEntries(getDataKeyFromRaw(storedEntry.key))
            expect(deletedData.get(creator1)!.deleted).toBeTrue()
        })

        it('data not stored', () => {
            const key = createRandomDataKey()
            const returnValue = localDataStore.markAsDeleted(
                key,
                getNodeIdFromPeerDescriptor(createMockPeerDescriptor())
            )
            expect(returnValue).toBe(false)
        })

        it('data not stored by the given creator', () => {
            const storedEntry = createMockDataEntry()
            localDataStore.storeEntry(storedEntry)
            const returnValue = localDataStore.markAsDeleted(
                getDataKeyFromRaw(storedEntry.key),
                getNodeIdFromPeerDescriptor(createMockPeerDescriptor())
            )
            expect(returnValue).toBe(false)
        })
    })
})
