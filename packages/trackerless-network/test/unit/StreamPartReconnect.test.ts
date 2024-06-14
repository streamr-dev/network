import { NodeStoreManager } from '../../src/logic/NodeStoreManager'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'
import { createFakeNodeStoreManager } from '../utils/fake/FakeNodeStoreManager'
import { waitForCondition } from '@streamr/utils'

describe('StreamPartReconnect', () => {

    let nodeStoreManager: NodeStoreManager
    let discoveryLayerNode: MockDiscoveryLayerNode
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        nodeStoreManager = createFakeNodeStoreManager()
        discoveryLayerNode = new MockDiscoveryLayerNode()
        streamPartReconnect = new StreamPartReconnect(discoveryLayerNode, nodeStoreManager)
    })

    afterEach(() => {
        streamPartReconnect.destroy()
    })

    it('Happy path', async () => {
        await streamPartReconnect.reconnect(1000)
        expect(streamPartReconnect.isRunning()).toEqual(true)
        discoveryLayerNode.addNewRandomPeerToKBucket()
        await waitForCondition(() => streamPartReconnect.isRunning() === false)
    })

})
