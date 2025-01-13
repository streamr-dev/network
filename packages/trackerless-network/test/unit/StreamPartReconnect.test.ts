import { PeerDescriptorStoreManager } from '../../src/logic/PeerDescriptorStoreManager'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'
import { createFakePeerDescriptorStoreManager } from '../utils/fake/FakePeerDescriptorStoreManager'
import { until } from '@streamr/utils'

describe('StreamPartReconnect', () => {
    let peerDescriptorSoreManager: PeerDescriptorStoreManager
    let discoveryLayerNode: MockDiscoveryLayerNode
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        peerDescriptorSoreManager = createFakePeerDescriptorStoreManager()
        discoveryLayerNode = new MockDiscoveryLayerNode()
        streamPartReconnect = new StreamPartReconnect(discoveryLayerNode, peerDescriptorSoreManager)
    })

    afterEach(() => {
        streamPartReconnect.destroy()
    })

    it('Happy path', async () => {
        await streamPartReconnect.reconnect(1000)
        expect(streamPartReconnect.isRunning()).toEqual(true)
        discoveryLayerNode.addNewRandomPeerToKBucket()
        await until(() => streamPartReconnect.isRunning() === false)
    })
})
