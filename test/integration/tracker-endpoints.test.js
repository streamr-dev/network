const got = require('got')
const { waitForCondition } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')

describe('tracker endpoint', () => {
    let tracker
    let nodeOne
    let nodeTwo

    const trackerPort = 31750
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
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker',
            attachHttpEndpoints: true
        })
        nodeOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 31751,
            id: 'node-1',
            trackers: [tracker.getAddress()],
            pingInterval: 100
        })
        nodeTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 31752,
            id: 'node-2',
            trackers: [tracker.getAddress()],
            location,
            pingInterval: 100
        })

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        nodeOne.subscribe(streamId2, 0)

        nodeOne.start()
        nodeTwo.start()

        await waitForCondition(() => Object.keys(tracker.overlayPerStream).length === 2)
    })

    afterEach(async () => {
        await nodeOne.stop()
        await nodeTwo.stop()
        await tracker.stop()
    })

    it('/topology/', async () => {
        const jsonResult = await got(`http://127.0.0.1:${trackerPort}/topology/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).not.toBeUndefined()
    })

    it('/topology/stream-1/', async () => {
        const jsonResult = await got(`http://127.0.0.1:${trackerPort}/topology/stream-1/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/topology/stream-1/0/', async () => {
        const jsonResult = await got(`http://127.0.0.1:${trackerPort}/topology/stream-1/0/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/location/', async () => {
        const jsonResult = await got(`http://127.0.0.1:${trackerPort}/topology/stream-1/0/`).json()
        expect(jsonResult['stream-1::0']).not.toBeUndefined()
        expect(jsonResult['stream-2::0']).toBeUndefined()
    })

    it('/metrics/ endpoint', async () => {
        const jsonResult = await got(`http://127.0.0.1:${trackerPort}/metrics/`).json()
        expect(jsonResult.trackerMetrics).not.toBeUndefined()
    })
})
