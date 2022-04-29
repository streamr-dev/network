import { DhtNode } from '../../src/dht/DhtNode'
import { createMockConnectionDhtNode, createWrappedClosestPeersRequest } from '../utils'
import { RouteMessageWrapper } from '../../src/proto/DhtRpc'

describe('Route Message With Mock Connections', () => {
    let node: DhtNode

    beforeEach(() => {
        node = createMockConnectionDhtNode('UnitNode')
    })

    afterEach(() => {
        await node.stop()
    })

    it ('canRoute', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(node.getPeerDescriptor(), node.getPeerDescriptor())
        // const routedMessage: RouteMessageWrapper = {
        //     message: rpcWrapper,
        //
        // }
        // node.canRoute()
    })
})