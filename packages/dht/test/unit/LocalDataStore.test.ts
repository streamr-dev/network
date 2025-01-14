import { wait } from '@streamr/utils'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { createMockPeerDescriptor } from '../utils/utils'
import { createMockDataEntry } from '../utils/mock/mockDataEntry'
import { randomDhtAddress, toDhtAddress, toNodeId } from '../../src/identifiers'

describe('LocalDataStore', () => {
    let localDataStore: LocalDataStore

    beforeEach(() => {
        localDataStore = new LocalDataStore(30 * 1000)
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const storedEntry = createMockDataEntry()
        localDataStore.storeEntry(storedEntry)
        const fetchedEntries = Array.from(localDataStore.values(toDhtAddress(storedEntry.key)))
        expect(fetchedEntries).toIncludeSameMembers([storedEntry])
    })

    it('multiple storers behind one key', () => {
        const creator1 = randomDhtAddress()
        const creator2 = randomDhtAddress()
        const key = randomDhtAddress()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        const fetchedEntries = Array.from(localDataStore.values(key))
        expect(fetchedEntries).toIncludeSameMembers([storedEntry1, storedEntry2])
    })

    it('can remove data entries', () => {
        const creator1 = randomDhtAddress()
        const creator2 = randomDhtAddress()
        const key = randomDhtAddress()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(key, creator1)
        const fetchedEntries = Array.from(localDataStore.values(key))
        expect(fetchedEntries).toIncludeSameMembers([storedEntry2])
    })

    it('can remove all data entries', () => {
        const creator1 = randomDhtAddress()
        const creator2 = randomDhtAddress()
        const key = randomDhtAddress()
        const storedEntry1 = createMockDataEntry({ key, creator: creator1 })
        const storedEntry2 = createMockDataEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(key, creator1)
        localDataStore.deleteEntry(key, creator2)
        expect(Array.from(localDataStore.values(key))).toHaveLength(0)
    })

    it('data is deleted after TTL', async () => {
        const storedEntry = createMockDataEntry({ ttl: 1000 })
        localDataStore.storeEntry(storedEntry)
        expect(Array.from(localDataStore.values(toDhtAddress(storedEntry.key)))).toHaveLength(1)
        await wait(1100)
        expect(Array.from(localDataStore.values(toDhtAddress(storedEntry.key)))).toHaveLength(0)
    })

    describe('mark data as deleted', () => {
        it('happy path', () => {
            const creator1 = randomDhtAddress()
            const storedEntry = createMockDataEntry({ creator: creator1 })
            localDataStore.storeEntry(storedEntry)
            const notDeletedData = Array.from(localDataStore.values(toDhtAddress(storedEntry.key)))
            expect(notDeletedData[0].deleted).toBeFalse()
            const returnValue = localDataStore.markAsDeleted(toDhtAddress(storedEntry.key), creator1)
            expect(returnValue).toBe(true)
            const deletedData = Array.from(localDataStore.values(toDhtAddress(storedEntry.key)))
            expect(deletedData[0].deleted).toBeTrue()
        })

        it('data not stored', () => {
            const key = randomDhtAddress()
            const returnValue = localDataStore.markAsDeleted(key, toNodeId(createMockPeerDescriptor()))
            expect(returnValue).toBe(false)
        })

        it('data not stored by the given creator', () => {
            const storedEntry = createMockDataEntry()
            localDataStore.storeEntry(storedEntry)
            const returnValue = localDataStore.markAsDeleted(
                toDhtAddress(storedEntry.key),
                toNodeId(createMockPeerDescriptor())
            )
            expect(returnValue).toBe(false)
        })
    })
})
