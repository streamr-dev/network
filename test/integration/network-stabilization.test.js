const assert = require('assert')

const { wait } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')

function areEqual(a, b) {
    try {
        assert.deepStrictEqual(a, b)
    } catch (error) {
        if (error.code === 'ERR_ASSERTION') {
            return false
        }
        throw error
    }
    return true
}

describe('check network stabilization', () => {
    let tracker
    let nodes
    const MAX_NODES = 10
    const startingPort = 39001

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 39000,
            id: 'tracker'
        })

        nodes = []
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            const node = await startNetworkNode({
                host: '127.0.0.1',
                port: startingPort + i,
                id: `node-${i}`,
                trackers: [tracker.getAddress()]
            })
            node.subscribe('stream', 0)
            node.start()
            nodes.push(node)
        }
    })

    afterEach(async () => {
        for (let i = 0; i < MAX_NODES; i++) {
            // eslint-disable-next-line no-await-in-loop
            await nodes[i].stop()
        }
        await tracker.stop()
    })

    it('network must become stable in less than 5 seconds', async (done) => {
        for (let i = 0; i < 10; ++i) {
            const beforeTopology = tracker.getTopology()
            // eslint-disable-next-line no-await-in-loop
            await wait(400)
            const afterTopology = tracker.getTopology()
            if (areEqual(beforeTopology, afterTopology)) {
                done()
                return
            }
        }
        done('did not stabilize')
    }, 11000)
})
