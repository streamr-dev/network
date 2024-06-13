import { KnownNodesManager } from '../../src/logic/KnownNodesManager'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'
import { createFakeKnownNodesManager } from '../utils/fake/FakeKnownNodesManager'
import { waitForCondition } from '@streamr/utils'

describe('StreamPartReconnect', () => {

    let knownNodesManager: KnownNodesManager
    let discoveryLayerNode: MockDiscoveryLayerNode
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        knownNodesManager = createFakeKnownNodesManager()
        discoveryLayerNode = new MockDiscoveryLayerNode()
        streamPartReconnect = new StreamPartReconnect(discoveryLayerNode, knownNodesManager)
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
