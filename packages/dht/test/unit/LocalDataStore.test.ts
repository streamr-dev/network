import { wait, randomString } from '@streamr/utils'
import crypto from 'crypto'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { PeerID } from '../../src/helpers/PeerID'
import {
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../src/helpers/peerIdFromPeerDescriptor'
import { Any } from '../../src/proto/google/protobuf/any'
import { Timestamp } from '../../src/proto/google/protobuf/timestamp'
import { DataEntry } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { MessageType as MessageType$, ScalarType } from '@protobuf-ts/runtime'

const MockData = new class extends MessageType$<{ foo: string }> {
    constructor() {
        super('MockData', [
            { no: 1, name: 'foo', kind: 'scalar', opt: false, T: ScalarType.STRING }
        ]);
    }
}

const createMockEntry = (entry: Partial<DataEntry>): DataEntry => {
    return { 
        key: crypto.randomBytes(10),
        data: Any.pack({ foo: randomString(5) }, MockData),
        creator: entry.creator ?? createMockPeerDescriptor(),
        ttl: 10000,
        stale: false,
        deleted: false,
        createdAt: Timestamp.now(),
        ...entry
    }
}

describe('LocalDataStore', () => {

    let localDataStore: LocalDataStore

    const getEntryArray = (key: Uint8Array) => {
        return Array.from(localDataStore.getEntries(PeerID.fromValue(key)).values())
    }

    const haveEqualData = (entry1: DataEntry, entry2: DataEntry) => {
        const entity1 = Any.unpack(entry1.data!, MockData)
        const entity2 = Any.unpack(entry2.data!, MockData)
        return (entity1.foo === entity2.foo)
    }

    beforeEach(() => {
        localDataStore = new LocalDataStore()
    })

    afterEach(() => {
        localDataStore.clear()
    })

    it('can store', () => {
        const storedEntry = createMockEntry({})
        localDataStore.storeEntry(storedEntry)
        const fetchedEntries = getEntryArray(storedEntry.key)
        expect(fetchedEntries).toHaveLength(1)
        expect(haveEqualData(fetchedEntries[0], storedEntry )).toBeTrue()
    })

    it('multiple storers behind one key', () => {
        const creator1 = createMockPeerDescriptor()
        const creator2 = createMockPeerDescriptor()
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        const fetchedEntries = localDataStore.getEntries(PeerID.fromValue(key))
        expect(fetchedEntries.size).toBe(2)
        expect(haveEqualData(fetchedEntries.get(keyFromPeerDescriptor(creator1))!, storedEntry1))
        expect(haveEqualData(fetchedEntries.get(keyFromPeerDescriptor(creator2))!, storedEntry2))
    })

    it('can remove data entries', () => {
        const creator1 = createMockPeerDescriptor()
        const creator2 = createMockPeerDescriptor()
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator1)
        const fetchedEntries = getEntryArray(key)
        expect(fetchedEntries).toHaveLength(1)
        expect(haveEqualData(fetchedEntries[0], storedEntry2 )).toBeTrue()
    })

    it('can remove all data entries', () => {
        const creator1 = createMockPeerDescriptor()
        const creator2 = createMockPeerDescriptor()
        const key = peerIdFromPeerDescriptor(creator1).value
        const storedEntry1 = createMockEntry({ key, creator: creator1 })
        const storedEntry2 = createMockEntry({ key, creator: creator2 })
        localDataStore.storeEntry(storedEntry1)
        localDataStore.storeEntry(storedEntry2)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator1)
        localDataStore.deleteEntry(PeerID.fromValue(key), creator2)
        expect(getEntryArray(key)).toHaveLength(0)
    })

    it('data is deleted after TTL', async () => {
        const storedEntry = createMockEntry({ ttl: 1000 })
        localDataStore.storeEntry(storedEntry)
        expect(getEntryArray(storedEntry.key)).toHaveLength(1)
        await wait(1100)
        expect(getEntryArray(storedEntry.key)).toHaveLength(0)
    })

    describe('mark data as deleted', () => {

        it('happy path', () => {
            const creator1 = createMockPeerDescriptor()
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
            const dataKey = peerIdFromPeerDescriptor(createMockPeerDescriptor())
            const returnValue = localDataStore.markAsDeleted(dataKey.value, peerIdFromPeerDescriptor(createMockPeerDescriptor()))
            expect(returnValue).toBe(false)
        })

        it('data not stored by the given creator', () => {
            const storedEntry = createMockEntry({})
            localDataStore.storeEntry(storedEntry)
            const returnValue = localDataStore.markAsDeleted(storedEntry.key, peerIdFromPeerDescriptor(createMockPeerDescriptor()))
            expect(returnValue).toBe(false)
        })
    })
})
