import { wait, waitForCondition } from '@streamr/utils'
import { range, sortBy } from 'lodash'
import { Key } from 'readline'
import { getDistance } from '../../src/dht/PeerManager'
import { StoreManager } from '../../src/dht/store/StoreManager'
import { NodeID, createRandomNodeId, getNodeIdFromBinary } from '../../src/helpers/nodeId'
import { getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { NodeType, ReplicateDataRequest } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor } from '../utils/utils'

const DATA_ENTRY = {
    key: createRandomNodeId(),
    creator: createMockPeerDescriptor()
}
const NODES_CLOSEST_TO_DATA = sortBy(
    range(5).map(() => createRandomNodeId()),
    (id: Uint8Array) => getDistance(getNodeIdFromBinary(id), getNodeIdFromBinary(DATA_ENTRY.key))
)

describe('StoreManager', () => {

    describe('new contact', () => {

        const createStoreManager = (
            localNodeId: Uint8Array,
            closestNeighbors: Uint8Array[],
            replicateData: (request: ReplicateDataRequest, doNotConnect: boolean) => unknown,
            setStale: (key: Key, creator: NodeID, stale: boolean) => unknown
        ): StoreManager => {
            const getClosestNeighborsTo = () => {
                return closestNeighbors.map((nodeId) => ({ nodeId, type: NodeType.NODEJS }))
            }
            return new StoreManager({
                rpcCommunicator: {
                    registerRpcMethod: () => {},
                    registerRpcNotification: () => {}
                } as any,
                recursiveOperationManager: undefined as any,
                localPeerDescriptor: { nodeId: localNodeId, type: NodeType.NODEJS },
                localDataStore: { values: () => [DATA_ENTRY], setStale } as any,
                serviceId: undefined as any,
                highestTtl: undefined as any,
                redundancyFactor: 3,
                getClosestNeighborsTo,
                createRpcRemote: () => ({ replicateData } as any)
            })
        }

        describe('this node is primary storer', () => {

            it('new node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest, boolean]>()
                const setStale = jest.fn<undefined, [Key, NodeID]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[0],
                    [NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[3], NODES_CLOSEST_TO_DATA[4]],
                    replicateData,
                    setStale
                )
                manager.onNewContact({ nodeId: NODES_CLOSEST_TO_DATA[2], type: NodeType.NODEJS })
                await waitForCondition(() => replicateData.mock.calls.length === 1)
                expect(replicateData).toHaveBeenCalledWith({
                    entry: DATA_ENTRY
                })
                expect(setStale).not.toHaveBeenCalled()
            })
    
            it('new node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest, boolean]>()
                const setStale = jest.fn<undefined, [Key, NodeID]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[0],
                    [NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[2], NODES_CLOSEST_TO_DATA[3]],
                    replicateData,
                    setStale
                )
                manager.onNewContact({ nodeId: NODES_CLOSEST_TO_DATA[4], type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setStale).not.toHaveBeenCalled()
            })
        })

        describe('this node is not primary storer', () => {

            it('this node is within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest, boolean]>()
                const setStale = jest.fn<undefined, [Key, NodeID]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[1],
                    [NODES_CLOSEST_TO_DATA[0], NODES_CLOSEST_TO_DATA[2], NODES_CLOSEST_TO_DATA[3]],
                    replicateData,
                    setStale
                )
                manager.onNewContact({ nodeId: NODES_CLOSEST_TO_DATA[4], type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setStale).not.toHaveBeenCalled()
            })

            it('this node is not within redundancy factor', async () => {
                const replicateData = jest.fn<undefined, [ReplicateDataRequest, boolean]>()
                const setStale = jest.fn<undefined, [Key, NodeID]>()
                const manager = createStoreManager(
                    NODES_CLOSEST_TO_DATA[3],
                    [NODES_CLOSEST_TO_DATA[0], NODES_CLOSEST_TO_DATA[1], NODES_CLOSEST_TO_DATA[2]],
                    replicateData,
                    setStale
                )
                manager.onNewContact({ nodeId: NODES_CLOSEST_TO_DATA[4], type: NodeType.NODEJS })
                await wait(50)
                expect(replicateData).not.toHaveBeenCalled()
                expect(setStale).toHaveBeenCalledTimes(1)
                expect(setStale).toHaveBeenCalledWith(DATA_ENTRY.key, getNodeIdFromPeerDescriptor(DATA_ENTRY.creator), true)
            })
        })
    })
})
