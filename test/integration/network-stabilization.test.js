const { startNetworkNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')

describe('check network stabilization', () => {
    let tracker
    const trackerPort = 39000

    let nodes
    const MAX_NODES = 10
    const startingPort = 39001

    const stream = 'super-stream'

    beforeEach(async () => {
        tracker = await startTracker({
            host: LOCALHOST, port: trackerPort, id: 'tracker'
        })
        // eslint-disable-next-line no-underscore-dangle
        expect(tracker._formAndSendInstructions).toBeInstanceOf(Function)

        nodes = []
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            const node = await startNetworkNode(LOCALHOST, startingPort + i, `node-${i}`)
            node.subscribe(stream, 0)
            node.addBootstrapTracker(tracker.getAddress())
            nodes.push(node)
        }
    }, 20000)

    afterEach(async () => {
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            await nodes[i].stop()
        }
        await tracker.stop()
    }, 40000)

    it('network must become stable in less than 15 seconds', async (done) => {
        let doneTimeout
        const spy = jest.spyOn(tracker, '_formAndSendInstructions').mockImplementation(() => {
            // reset spy calls and timeout
            clearTimeout(doneTimeout)
            jest.clearAllMocks()

            doneTimeout = setTimeout(() => {
                expect(spy).not.toHaveBeenCalled()
                done()
            }, 5000)
        })
    }, 15000)
})
