const { PRIVATE_KEY, LOCALHOST } = require('../util')
const { startTracker } = require('../../src/composition')

describe('tracker creation', () => {
    it('should be able to start and stop successfully', async (done) => {
        const tracker = await startTracker(LOCALHOST, 30336, PRIVATE_KEY)
        expect(tracker.getAddress()).toEqual('/ip4/127.0.0.1/tcp/30336/ipfs/QmQ2zigjQikYnyYUSXZydNXrDRhBut2mubwJBaLXobMt3A')
        tracker.stop(() => done())
    })
})
