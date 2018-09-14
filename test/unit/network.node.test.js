const assert = require('assert')
const startNetworkNode = require('../../src/NetworkNode')

jest.setTimeout(50000)

describe('NetworkNode creation', () => {
    it('should be able to start and stop successfully', async (done) => {
        const networkNode = await startNetworkNode('127.0.0.1', 30370)
        assert.equal(networkNode.subscribed, undefined)

        networkNode.node.stop(() => done())
    })
})
