const { startNetworkNode, startTracker } = require('../../src/composition')

describe('check network stabilization', () => {
    let tracker
    let nodes
    const MAX_NODES = 10
    const startingPort = 39001

    const stream = 'super-stream'

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 39000,
            id: 'tracker'
        })
        // eslint-disable-next-line no-underscore-dangle
        expect(tracker._formAndSendInstructions).toBeInstanceOf(Function)

        nodes = []
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            const node = await startNetworkNode({
                host: '127.0.0.1',
                port: startingPort + i,
                id: `node-${i}`,
                trackers: [tracker.getAddress()]
            })
            node.subscribe(stream, 0)
            node.start()
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
