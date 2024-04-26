import { wait, waitForCondition } from '@streamr/utils'
import { range, sortBy } from 'lodash'
import { getDistance } from '../../src/dht/PeerManager'
import { StoreManager } from '../../src/dht/store/StoreManager'
import {
    DhtAddress,
    createRandomDhtAddress,
    getDhtAddressFromRaw,
    getRawFromDhtAddress,
} from '../../src/identifiers'
import { NodeType, ReplicateDataRequest } from '../../src/proto/packages/dht/protos/DhtRpc'

const DATA_ENTRY = {
    key: getRawFromDhtAddress(createRandomDhtAddress()),
    creator: getRawFromDhtAddress(createRandomDhtAddress())
}
const NODES_CLOSEST_TO_DATA = sortBy(
    range(5).map(() => createRandomDhtAddress()),
    (id: DhtAddress) => getDistance(getRawFromDhtAddress(id), DATA_ENTRY.key)
)

const createPeerDescriptor = (nodeId: DhtAddress) => {
    return { nodeId: getRawFromDhtAddress(nodeId), type: NodeType.NODEJS }
}

describe('StoreManager', () => {

    describe('new contact', () => {

        const createStoreManager = (
            localNodeId: DhtAddress,
            neighbors: DhtAddress[],
            replicateData: (request: ReplicateDataRequest) => unknown,
            setAllEntriesAsStale: (key: DhtAddress) => unknown
        ): StoreManager => {
            return new StoreManager({
                rpcCommunicator: {
                    registerRpcMethod: () => {},
                    registerRpcNotification: () => {}
                } as any,
                recursiveOperationManager: undefined as any,
                localPeerDescriptor: createPeerDescriptor(localNodeId),
                localDataStore: { 
                    keys: () => [getDhtAddressFromRaw(DATA_ENTRY.key)],
                    values: () => [DATA_ENTRY],
                    setAllEntriesAsStale 
                } as any,
                serviceId: undefined as any,
                highestTtl: undefined as any,
                redundancyFactor: 3,
                getNeighbors: () => neighbors.map((nodeId) => createPeerDescriptor(nodeId)),
                createRpcRemote: () => ({ replicateData } as any)
            })
        }

        describe('this node is primary storer', () => {

            it('new node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[0],
                    [NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[3], NODES_CLOSEST_TO_DATA[4]],
                    replicateData,
                    setAllEntriesAsStale
                )
                manager.onContactAdded({ nodeId: getRawFromDhtAddress(NODES_CLOSEST_TO_DATA[2]), type: NodeType.NODEJS })
                await waitForCondition(() => replicateData.mock.calls.length === 1)
                expect(replicateData).toHaveBeenCalledWith({
                    entry: DATA_ENTRY
                })
                expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            })
    
            it('new node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[0],
                    [NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[2], NODES_CLOSEST_TO_DATA[3]],
                    replicateData,
                    setAllEntriesAsStale
                )
                manager.onContactAdded({ nodeId: getRawFromDhtAddress(NODES_CLOSEST_TO_DATA[4]), type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).not.toHaveBeenCalled()
            })
        })

        describe('this node is not primary storer', () => {

            it('this node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[1],
                    [NODES_CLOSEST_TO_DATA[0], NODES_CLOSEST_TO_DATA[2], NODES_CLOSEST_TO_DATA[3]],
                    replicateData,
                    setAllEntriesAsStale
                )
                manager.onContactAdded({ nodeId: getRawFromDhtAddress(NODES_CLOSEST_TO_DATA[4]), type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
            })

            it('this node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[3],
                    [NODES_CLOSEST_TO_DATA[0], NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[2]],
                    replicateData,
                    setAllEntriesAsStale
                )
                manager.onContactAdded({ nodeId: getRawFromDhtAddress(NODES_CLOSEST_TO_DATA[4]), type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).toHaveBeenCalledTimes(1)
                expect(setAllEntriesAsStale).toHaveBeenCalledWith(getDhtAddressFromRaw(DATA_ENTRY.key))
            })

            it('this node has less than redundancyFactor neighbors', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest]>()
                const setAllEntriesAsStale = jest.fn<undefined, [DhtAddress]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[3],
                    [NODES_CLOSEST_TO_DATA[0], NODES_CLOSEST_TO_DATA[1]],
                    replicateData,
                    setAllEntriesAsStale
                )
                manager.onContactAdded({ nodeId: getRawFromDhtAddress(NODES_CLOSEST_TO_DATA[4]), type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setAllEntriesAsStale).toHaveBeenCalledTimes(0)
            })
        })
    })
})
