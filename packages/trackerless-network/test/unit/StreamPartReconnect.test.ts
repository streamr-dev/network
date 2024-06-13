import { EntryPointDiscovery } from '../../src/logic/EntryPointDiscovery'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockDiscoveryLayerNode } from '../utils/mock/MockDiscoveryLayerNode'
import { createFakeEntryPointDiscovery } from '../utils/fake/FakeEntryPointDiscovery'
import { waitForCondition } from '@streamr/utils'

describe('StreamPartReconnect', () => {

    let entryPointDiscovery: EntryPointDiscovery
    let discoveryLayerNode: MockDiscoveryLayerNode
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        entryPointDiscovery = createFakeEntryPointDiscovery()
        discoveryLayerNode = new MockDiscoveryLayerNode()
        streamPartReconnect = new StreamPartReconnect(discoveryLayerNode, entryPointDiscovery)
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
