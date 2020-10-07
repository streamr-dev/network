const { startNetworkNode } = require('../../src/composition')

describe('NetworkNode creation', () => {
    it('should be able to start and stop successfully', async () => {
        const networkNode = await startNetworkNode('127.0.0.1', 30370)
        expect(networkNode.protocols.nodeToNode.endpoint.getAddress()).toEqual('ws://127.0.0.1:30370')
        await networkNode.stop()
    })
})
