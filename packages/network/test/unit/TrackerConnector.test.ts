import { wait } from 'streamr-test-utils'
import { SPID, Utils } from 'streamr-client-protocol'
import { TrackerConnector } from '../../src/logic/node/TrackerConnector'
import { TrackerInfo } from '../../src/identifiers'
import { TrackerId } from '../../src/logic/tracker/Tracker'

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

const T1_STREAM = SPID.from('streamOne#0')
const T2_STREAM = SPID.from('streamOne#15')
const T3_STREAM = SPID.from('streamSix#0')
const T4_STREAM = SPID.from('streamTwo#0')

describe(TrackerConnector, () => {
    let streams: Array<SPID>
    let activeConnections: Set<TrackerId>
    let connector: TrackerConnector

    beforeAll(() => {
        // sanity check stream hash assignments
        const trackerRegistry = new Utils.TrackerRegistry<TrackerInfo>(TRACKERS)
        function checkTrackerAssignment(spid: SPID, expectedTracker: TrackerInfo): void {
            expect(trackerRegistry.getTracker(spid)).toEqual(expectedTracker)
        }
        checkTrackerAssignment(T1_STREAM, TRACKERS[0])
        checkTrackerAssignment(T2_STREAM, TRACKERS[1])
        checkTrackerAssignment(T3_STREAM, TRACKERS[2])
        checkTrackerAssignment(T4_STREAM, TRACKERS[3])
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
        expect(Object.keys(activeConnections).length).toEqual(0)
    })

    it('maintains tracker connections based on active streams', async () => {
        setUpConnector(TTL_IN_MS)
        connector.start()

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(Object.keys(activeConnections).length).toEqual(0)

        streams = [T1_STREAM]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t1']))

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(Object.keys(activeConnections).length).toEqual(0)

        streams = [T2_STREAM, T3_STREAM]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t2', 't3']))

        streams = [
            T4_STREAM,
            T3_STREAM,
            T2_STREAM
        ]
        await wait(TTL_IN_MS + 1)
        expect(activeConnections).toEqual(new Set<string>(['t2', 't3', 't4']))

        streams = []
        await wait(TTL_IN_MS + 1)
        expect(Object.keys(activeConnections).length).toEqual(0)
    })

    it('onNewStream can be used to form immediate connections', () => {
        setUpConnector(1000000000)
        connector.start()

        connector.onNewStream(T2_STREAM)
        expect(activeConnections).toEqual(new Set<string>(['t2']))

        connector.onNewStream(T4_STREAM)
        expect(activeConnections).toEqual(new Set<string>(['t2', 't4']))
    })
})
