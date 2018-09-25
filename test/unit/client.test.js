const assert = require('assert')
const Client = require('../../src/logic/Client')
const { createEndpoint } = require('../../src/connection/Libp2pEndpoint')
const { PRIVATE_KEY, LOCALHOST } = require('../util')
const NodeToNode = require('../../src/protocol/NodeToNode')

describe('publisher creation', () => {
    it('should be able to start and stop successfully', (done) => {
        createEndpoint(LOCALHOST, 30335, PRIVATE_KEY).then((endpoint) => {
            const client = new Client(new NodeToNode(endpoint))

            assert.equal(client.getAddress(), '/ip4/127.0.0.1/tcp/30335/ipfs/QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A')

            client.stop(() => done())
        }).catch((err) => {
            throw err
        })
    })
})
