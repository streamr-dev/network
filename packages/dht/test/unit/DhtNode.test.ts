import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode } from '../utils'

describe('Route Message With Mock Connections', () => {
    let node: DhtNode

    beforeEach(async () => {
        node = createMockConnectionDhtNode('UnitNode')
    })

    afterEach(async () => {
        await node.stop()
    })

    it ('canRoute', async () => {
        // const rpcWrapper = createWrappedClosestPeersRequest(node.getPeerDescriptor(), node.getPeerDescriptor())

    })
})