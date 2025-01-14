import { range } from 'lodash'
import { StoreRpcLocal } from '../../src/dht/store/StoreRpcLocal'
import {
    areEqualPeerDescriptors,
    randomDhtAddress,
    DhtAddress,
    toDhtAddress,
    toDhtAddressRaw
} from '../../src/identifiers'
import { DataEntry, PeerDescriptor, StoreDataRequest } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { getClosestNodes } from '../../src/dht/contact/getClosestNodes'
import { wait } from '@streamr/utils'

describe('StoreRpcLocal', () => {
    const NODE_COUNT = 5
    const DATA_ENTRY = {
        key: toDhtAddressRaw(randomDhtAddress()),
        creator: toDhtAddressRaw(randomDhtAddress())
    }

    const ALL_NODES = range(NODE_COUNT).map(() => createMockPeerDescriptor())

    const getNodeCloseToData = (distanceIndex: number) => {
        const dataKey = toDhtAddress(DATA_ENTRY.key)
        return getClosestNodes(dataKey, ALL_NODES)[distanceIndex]
    }

    let storeRpcLocal: StoreRpcLocal
    let setAllEntriesAsStale: jest.Mock<undefined, [DhtAddress]>
    let replicateDataToContact: jest.Mock<Promise<void>, [DataEntry, PeerDescriptor]>

    beforeEach(() => {
        setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
        replicateDataToContact = jest.fn<Promise<void>, [DataEntry, PeerDescriptor]>()
    })

    describe('local node is primary storer', () => {
        beforeEach(() => {
            const localPeerDescriptor = getNodeCloseToData(0)
            storeRpcLocal = new StoreRpcLocal({
                localDataStore: {
                    storeEntry: () => true,
                    setAllEntriesAsStale
                } as any,
                localPeerDescriptor,
                replicateDataToContact,
                getStorers: () => getClosestNodes(toDhtAddress(DATA_ENTRY.key), ALL_NODES)
            })
        })

        it('storeData', async () => {
            const request = StoreDataRequest.create({
                key: DATA_ENTRY.key
            })
            await storeRpcLocal.storeData(request)
            expect(setAllEntriesAsStale).not.toHaveBeenCalled()
        })

        it('replicateData', async () => {
            const request = {
                entry: DATA_ENTRY
            }
            await storeRpcLocal.replicateData(
                request as any,
                { incomingSourceDescriptor: createMockPeerDescriptor() } as any
            )
            expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            // Wait for setImmediate
            await wait(50)
            expect(replicateDataToContact).toHaveBeenCalledTimes(NODE_COUNT - 1)
        })
    })

    describe('local node is storer', () => {
        beforeEach(() => {
            const localPeerDescriptor = getNodeCloseToData(1)
            storeRpcLocal = new StoreRpcLocal({
                localDataStore: {
                    storeEntry: () => true,
                    setAllEntriesAsStale
                } as any,
                localPeerDescriptor,
                replicateDataToContact,
                getStorers: () => getClosestNodes(toDhtAddress(DATA_ENTRY.key), ALL_NODES)
            })
        })

        it('storeData', async () => {
            const request = StoreDataRequest.create({
                key: DATA_ENTRY.key
            })
            await storeRpcLocal.storeData(request)
            expect(setAllEntriesAsStale).not.toHaveBeenCalled()
        })

        it('replicateData', async () => {
            const request = {
                entry: DATA_ENTRY
            }
            await storeRpcLocal.replicateData(
                request as any,
                { incomingSourceDescriptor: createMockPeerDescriptor() } as any
            )
            expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            // Wait for setImmediate
            await wait(50)
            expect(replicateDataToContact).toHaveBeenCalledTimes(1)
        })
    })

    describe('local node is not storer', () => {
        beforeEach(() => {
            const localPeerDescriptor = getNodeCloseToData(NODE_COUNT - 1)
            storeRpcLocal = new StoreRpcLocal({
                localDataStore: {
                    storeEntry: () => true,
                    setAllEntriesAsStale
                } as any,
                localPeerDescriptor,
                replicateDataToContact,
                getStorers: () =>
                    getClosestNodes(toDhtAddress(DATA_ENTRY.key), ALL_NODES).filter(
                        (peerDescriptor) => !areEqualPeerDescriptors(peerDescriptor, localPeerDescriptor)
                    )
            })
        })

        it('storeData', async () => {
            const request = StoreDataRequest.create({
                key: DATA_ENTRY.key
            })
            await storeRpcLocal.storeData(request)
            expect(setAllEntriesAsStale).toHaveBeenCalled()
        })

        it('replicateData', async () => {
            const request = {
                entry: DATA_ENTRY
            }
            await storeRpcLocal.replicateData(
                request as any,
                { incomingSourceDescriptor: createMockPeerDescriptor() } as any
            )
            expect(setAllEntriesAsStale).toHaveBeenCalledTimes(1)
            // Wait for setImmediate
            await wait(50)
            expect(replicateDataToContact).toHaveBeenCalledTimes(1)
        })
    })

    describe('data was not stored', () => {
        beforeEach(() => {
            const localPeerDescriptor = getNodeCloseToData(1)
            storeRpcLocal = new StoreRpcLocal({
                localDataStore: {
                    storeEntry: () => false,
                    setAllEntriesAsStale
                } as any,
                localPeerDescriptor,
                replicateDataToContact,
                getStorers: () => getClosestNodes(toDhtAddress(DATA_ENTRY.key), ALL_NODES)
            })
        })

        it('replicateData', async () => {
            const request = {
                entry: DATA_ENTRY
            }
            await storeRpcLocal.replicateData(
                request as any,
                { incomingSourceDescriptor: createMockPeerDescriptor() } as any
            )
            expect(setAllEntriesAsStale).toHaveBeenCalledTimes(0)
            // Wait for setImmediate
            await wait(50)
            expect(replicateDataToContact).toHaveBeenCalledTimes(0)
        })
    })
})
