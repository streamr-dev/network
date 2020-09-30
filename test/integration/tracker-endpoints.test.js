const got = require('got')
const { waitForCondition } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')

describe('tracker endpoint', () => {
    let tracker
    let nodeOne
    let nodeTwo

    const trackerPort = '31750'
    const streamId = 'stream-1'
    const streamId2 = 'stream-2'

    const location = {
        country: 'FI',
        city: 'Helsinki',
        latitude: null,
        longitude: null
    }

    beforeEach(async () => {
        tracker = await startTracker({
            host: LOCALHOST, port: trackerPort, id: 'tracker', exposeHttpEndpoints: true
        })
        nodeOne = await startNetworkNode(LOCALHOST, 31752, 'node-1', [], null, 'node-1', null, 100)
        nodeTwo = await startNetworkNode(LOCALHOST, 31753, 'node-2', [], null, 'node-2', location, 100)

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        nodeOne.subscribe(streamId2, 0)

        nodeOne.addBootstrapTracker(tracker.getAddress())
        nodeTwo.addBootstrapTracker(tracker.getAddress())

        await waitForCondition(() => Object.keys(tracker.overlayPerStream).length === 2)
    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('/topology/', async () => {
        const jsonResult = await got(`http://${LOCALHOST}:${trackerPort}/topology/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).not.toBeUndefined()
    })

    it('/topology/stream-1/', async () => {
        const jsonResult = await got(`http://${LOCALHOST}:${trackerPort}/topology/stream-1/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/topology/stream-1/0/', async () => {
        const jsonResult = await got(`http://${LOCALHOST}:${trackerPort}/topology/stream-1/0/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/location/', async () => {
        const jsonResult = await got(`http://${LOCALHOST}:${trackerPort}/topology/stream-1/0/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/metrics/ endpoint', async () => {
        const jsonResult = await got(`http://${LOCALHOST}:${trackerPort}/metrics/`).json()
        expect(jsonResult.trackerMetrics).not.toBeUndefined()
    })
})
