const { LOCALHOST } = require('../util')
const { startTracker } = require('../../src/composition')

describe('tracker', () => {
    const trackerPort = 30300
    let tracker

    beforeAll(async () => {
        tracker = await startTracker({
            host: LOCALHOST, port: trackerPort, id: 'tracker'
        })
    })

    afterAll(async () => {
        await tracker.stop()
    })

    it('tracker should be able to start and stop successfully', async () => {
        expect(tracker.getAddress()).toEqual(`ws://${LOCALHOST}:30300`)
    })
})
