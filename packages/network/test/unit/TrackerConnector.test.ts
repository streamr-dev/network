import { Utils } from 'streamr-client-protocol'
import { TrackerConnector } from '../../src/logic/node/TrackerConnector'
import { StreamIdAndPartition, TrackerInfo } from '../../src/identifiers'
import { TrackerId } from '../../src/logic/tracker/Tracker'
import { wait } from 'streamr-test-utils'

const TTL_IN_MS = 10

const TRACKERS = [
    {
        id: 't1',
        http: 'http://t1.xyz',
        ws: 'ws://t1.xyz'
    },
    {
        id: 't2',
        http: 'http://t2.xyz',
        ws: 'ws://t2.xyz'
    },
    {
        id: 't3',
        http: 'http://t3.xyz',
        ws: 'ws://t3.xyz'
    },
    {
        id: 't4',
        http: 'http://t4.xyz',
        ws: 'ws://t4.xyz'
    },
]

const STREAMS = [
    new StreamIdAndPartition('streamOne', 0),   // t1
    new StreamIdAndPartition('streamOne', 15),  // t2
    new StreamIdAndPartition('streamSix', 0),   // t3
    new StreamIdAndPartition('streamTwo', 0)    // t4
]

describe(TrackerConnector, () => {
    let streams: Array<StreamIdAndPartition>
    let activeConnections: Set<TrackerId>
    let connector: TrackerConnector

    beforeAll(() => {
        // sanity check stream hash assignments
        const trackerRegistry = new Utils.TrackerRegistry<TrackerInfo>(TRACKERS)
        for (let i = 0; i < STREAMS.length; ++i) {
            expect(trackerRegistry.getTracker(STREAMS[i].id, STREAMS[i].partition)).toEqual(TRACKERS[i])
        }
    })

    function setUpConnector(intervalInMs: number) {
        streams = []
        activeConnections = new Set<TrackerId>()
        connector = new TrackerConnector(
            () => streams,
            (_wsUrl, trackerInfo) => {
                activeConnections.add(trackerInfo.peerId)
                return Promise.resolve()
            },
            (trackerId) => {
                activeConnections.delete(trackerId)
            },
            new Utils.TrackerRegistry<TrackerInfo>(TRACKERS),
            intervalInMs
        )
    }

    afterEach(() => {
        connector?.stop()
    })

    it('maintains no tracker connections if no streams', async () => {
        setUpConnector(TTL_IN_MS)
        connector.start()
        await wait(TTL_IN_MS * 2)
        expect(activeConnections).toBeEmpty()
    })

    it('maintains tracker connections based on active streams', async () => {
        setUpConnector(TTL_IN_MS)
        connector.start()

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toBeEmpty()

        streams = [STREAMS[0]]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t1']))

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toBeEmpty()

        streams = [STREAMS[1], STREAMS[2]]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t2', 't3']))

        streams = [
            STREAMS[3],
            STREAMS[2],
            STREAMS[1]
        ]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t2', 't3', 't4']))

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toBeEmpty()
    })

    it('onNewStream can be used to form immediate connections', () => {
        setUpConnector(1000000000)
        connector.start()

        connector.onNewStream(STREAMS[1])
        expect(activeConnections).toEqual(new Set<string>(['t2']))

        connector.onNewStream(STREAMS[3])
        expect(activeConnections).toEqual(new Set<string>(['t2', 't4']))
    })
})
