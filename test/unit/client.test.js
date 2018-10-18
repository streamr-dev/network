const { LOCALHOST } = require('../util')
const { startClient } = require('../../src/composition')

describe('publisher creation', () => {
    it('should be able to start and stop successfully', async (done) => {
        startClient(LOCALHOST, 30335, 'publisher1', null)
            .then((client) => {
                expect(client.protocols.nodeToNode.endpoint.getAddress()).toEqual('ws://127.0.0.1:30335')
                client.stop(() => done())
            })
    })
})
