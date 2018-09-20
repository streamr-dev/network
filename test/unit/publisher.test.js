const assert = require('assert')
const Publisher = require('../../src/logic/Publisher')
const { createEndpoint } = require('../../src/connection/Libp2pEndpoint')
const { PRIVATE_KEY, LOCALHOST } = require('../util')
const NodeToNode = require('../../src/protocol/NodeToNode')

describe('publisher creation', () => {
    it('should be able to start and stop successfully', (done) => {
        createEndpoint(LOCALHOST, 30335, PRIVATE_KEY).then((endpoint) => {
            const publisher = new Publisher(new NodeToNode(endpoint))

            assert.equal(publisher.getAddress(), '/ip4/127.0.0.1/tcp/30335/ipfs/QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A')

            publisher.stop(() => done())
        }).catch((err) => {
            throw err
        })
    })
})
