const { LOCALHOST } = require('../util')
const { startTracker } = require('../../src/composition')

describe('tracker creation', () => {
    it('should be able to start and stop successfully', async () => {
        const tracker = await startTracker(LOCALHOST, 30300, 'tracker')
        expect(tracker.getAddress()).toEqual('ws://:::30300')
        await tracker.stop()
    })
})
