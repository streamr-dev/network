const assert = require('assert')
const Tracker = require('../../src/logic/Tracker')
const { PRIVATE_KEY, LOCALHOST } = require('../util')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { createEndpoint } = require('../../src/connection/Libp2pEndpoint')

describe('tracker creation', () => {
    it('should be able to start and stop successfully', (done) => {
        createEndpoint(LOCALHOST, 30336, PRIVATE_KEY).then((endpoint) => {
            const tracker = new Tracker(new TrackerServer(endpoint))

            assert.equal(tracker.getAddress(), '/ip4/127.0.0.1/tcp/30336/ipfs/QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A')

            tracker.protocols.trackerServer.stop(() => done())
        }).catch((err) => {
            throw err
        })
    })
})
