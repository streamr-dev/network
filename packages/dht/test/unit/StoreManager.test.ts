import { wait, until } from '@streamr/utils'
import { range, without } from 'lodash'
import { getClosestNodes } from '../../src/dht/contact/getClosestNodes'
import { StoreManager } from '../../src/dht/store/StoreManager'
import { DhtAddress, randomDhtAddress, toDhtAddress, toDhtAddressRaw } from '../../src/identifiers'
import { PeerDescriptor, ReplicateDataRequest } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const NODE_COUNT = 10

const DATA_ENTRY = {
    key: toDhtAddressRaw(randomDhtAddress()),
    creator: toDhtAddressRaw(randomDhtAddress())
}
const ALL_NODES = range(NODE_COUNT).map(() => createMockPeerDescriptor())

const getNodeCloseToData = (distanceIndex: number) => {
    const dataKey = toDhtAddress(DATA_ENTRY.key)
    return getClosestNodes(dataKey, ALL_NODES)[distanceIndex]
}

describe('StoreManager', () => {
    describe('new contact', () => {
        const createStoreManager = (
            localPeerDescriptor: PeerDescriptor,
            redundancyFactor: number,
            replicateData: (request: ReplicateDataRequest) => unknown,
            setAllEntriesAsStale: (key: DhtAddress) => unknown
        ): StoreManager => {
            return new StoreManager({
                rpcCommunicator: {
                    registerRpcMethod: () => {},
                    registerRpcNotification: () => {}
                } as any,
                recursiveOperationManager: undefined as any,
                localPeerDescriptor,
                localDataStore: {
                    keys: () => [toDhtAddress(DATA_ENTRY.key)],
                    values: () => [DATA_ENTRY],
                    setAllEntriesAsStale
                } as any,
                serviceId: undefined as any,
                highestTtl: undefined as any,
                redundancyFactor,
                getNeighbors: () => without(ALL_NODES, localPeerDescriptor),
                createRpcRemote: () => ({ replicateData }) as any
            })
        }

        describe('this node was primary storer', () => {
            it('new node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const localNode = getNodeCloseToData(0)
                const manager = createStoreManager(localNode, 3, replicateData, setAllEntriesAsStale)
                manager.onContactAdded(getNodeCloseToData(2))
                await until(() => replicateData.mock.calls.length === 1)
                expect(replicateData).toHaveBeenCalledWith(
                    {
                        entry: DATA_ENTRY
                    },
                    true
                )
                expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            })

            it('new node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const localNode = getNodeCloseToData(0)
                const manager = createStoreManager(localNode, 3, replicateData, setAllEntriesAsStale)
                manager.onContactAdded(getNodeCloseToData(4))
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            })
        })

        describe('this node was not primary storer', () => {
            it('this node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const localNode = getNodeCloseToData(1)
                const manager = createStoreManager(localNode, 3, replicateData, setAllEntriesAsStale)
                manager.onContactAdded(getNodeCloseToData(4))
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).toHaveBeenCalledTimes(0)
            })

            it('this node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const localNode = getNodeCloseToData(3)
                const manager = createStoreManager(localNode, 3, replicateData, setAllEntriesAsStale)
                manager.onContactAdded(getNodeCloseToData(4))
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).toHaveBeenCalledTimes(1)
                expect(setAllEntriesAsStale).toHaveBeenCalledWith(toDhtAddress(DATA_ENTRY.key))
            })

            it('this node is within redundancy factor, the node has less than redundancyFactor neighbors', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const localNode = getNodeCloseToData(3)
                const manager = createStoreManager(localNode, 100, replicateData, setAllEntriesAsStale)
                manager.onContactAdded(getNodeCloseToData(4))
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).toHaveBeenCalledTimes(0)
            })
        })
    })
})
