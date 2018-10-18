const { startNetworkNode } = require('../../src/composition')
const { LOCALHOST, DEFAULT_TIMEOUT } = require('../util')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('NetworkNode creation', () => {
    it('should be able to start and stop successfully', async (done) => {
        const networkNode = await startNetworkNode(LOCALHOST, 30370)
        networkNode.stop(done)
    })
})
