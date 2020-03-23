const { wait } = require('streamr-test-utils')

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
        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')
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
        await wait(3000)
    }, 20000)

    afterEach(async () => {
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            await nodes[i].stop()
        }
        await tracker.stop()
    }, 40000)

    it('expect _formAndSendInstructions not to be called when topology is stable', async () => {
        await wait(15000)
        const spy = jest.spyOn(tracker, '_formAndSendInstructions').mockImplementation(() => {})
        await wait(10000)
        expect(spy).not.toHaveBeenCalled()
        jest.restoreAllMocks()
    }, 40000)
})
