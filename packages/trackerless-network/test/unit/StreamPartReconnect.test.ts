import { KnownNodesManager } from '../../src/logic/KnownNodesManager'
import { StreamPartReconnect } from '../../src/logic/StreamPartReconnect'
import { MockLayer1Node } from '../utils/mock/MockLayer1Node'
import { createFakeKnownNodesManager } from '../utils/fake/FakeKnownNodesManager'
import { waitForCondition } from '@streamr/utils'

describe('StreamPartReconnect', () => {

    let knownNodesManager: KnownNodesManager
    let layer1Node: MockLayer1Node
    let streamPartReconnect: StreamPartReconnect

    beforeEach(() => {
        knownNodesManager = createFakeKnownNodesManager()
        layer1Node = new MockLayer1Node()
        streamPartReconnect = new StreamPartReconnect(layer1Node, knownNodesManager)
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
