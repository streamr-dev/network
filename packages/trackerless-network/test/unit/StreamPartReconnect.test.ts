import { EntryPointDiscovery } from '../../src/logic/EntryPointDiscovery'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'
import { createFakeEntryPointDiscovery } from '../utils/fake/FakeEntryPointDiscovery'
import { waitForCondition } from '@streamr/utils'

describe('StreamPartReconnect', () => {

    let entryPointDiscovery: EntryPointDiscovery
    let layer1Node: MockLayer1Node
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        entryPointDiscovery = createFakeEntryPointDiscovery()
        layer1Node = new MockLayer1Node()
        streamPartReconnect = new StreamPartReconnect(layer1Node, entryPointDiscovery)
    })

    afterEach(() => {
        streamPartReconnect.destroy()
    })

    it('Happy path', async () => {
        await streamPartReconnect.reconnect(1000)
        expect(streamPartReconnect.isRunning()).toEqual(true)
        layer1Node.addNewRandomPeerToKBucket()
        await waitForCondition(() => streamPartReconnect.isRunning() === false)
    })

})
