const assert = require('assert')
const Publisher = require('../../src/logic/Publisher')
const { createConnection } = require('../../src/connection/Connection')
const { PRIVATE_KEY, LOCALHOST } = require('../util')
const NodeToNode = require('../../src/protocol/NodeToNode')

describe('publisher creation', () => {
    it('should be able to start and stop successfully', (done) => {
        createConnection(LOCALHOST, 30335, PRIVATE_KEY).then((connection) => {
            const publisher = new Publisher(new NodeToNode(connection))

            assert.equal(publisher.getAddress(), '/ip4/127.0.0.1/tcp/30335/ipfs/QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A')

            publisher.stop(() => done())
        }).catch((err) => {
            throw err
        })
    })
})
