const { startNetworkNode } = require('../../src/composition')
const { LOCALHOST } = require('../util')

describe('NetworkNode creation', () => {
    it('should be able to start and stop successfully', async () => {
        const networkNode = await startNetworkNode(LOCALHOST, 30370)
        expect(networkNode.protocols.nodeToNode.basicProtocol.endpoint.getAddress()).toEqual('ws://127.0.0.1:30370')
        await networkNode.stop()
    })
})
