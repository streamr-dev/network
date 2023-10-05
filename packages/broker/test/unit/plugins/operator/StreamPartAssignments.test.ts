import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import EventEmitter3 from 'eventemitter3'
import { OperatorFleetStateEvents } from '../../../../src/plugins/operator/OperatorFleetState'
import { MaintainTopologyHelperEvents } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { eventsWithArgsToArray } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import range from 'lodash/range'
import { NodeID } from '@streamr/trackerless-network'

const MY_NODE_ID = '0x0000' as NodeID
const N1 = '0x1111' as NodeID
const N2 = '0x2222' as NodeID
const S1 = toStreamID('S1')
const S2 = toStreamID('S2')
const S3 = toStreamID('S3')
const S4 = toStreamID('S4')
const NON_EXISTING_STREAM = toStreamID('NON_EXISTING_STREAM')

const streamPartMappings = new Map<StreamID, StreamPartID[]>()
    .set(S1, range(2).map((p) => toStreamPartID(S1, p)))
    .set(S2, range(1).map((p) => toStreamPartID(S2, p)))
    .set(S3, range(3).map((p) => toStreamPartID(S3, p)))
    .set(S4, range(1).map((p) => toStreamPartID(S4, p)))

describe(StreamPartAssignments, () => {
    let events: [string, ...any[]][]
    let operatorFleetState: EventEmitter3<OperatorFleetStateEvents>
    let maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>
    let assigments: StreamPartAssignments

    function clearEvents(): void {
        events.length = 0
    }

    beforeEach(() => {
        const getStreamParts = jest.fn<Promise<StreamPartID[]>, [StreamID]>()
        getStreamParts.mockImplementation(async (streamId) => {
            const streamParts = streamPartMappings.get(toStreamID(streamId))
            if (streamParts === undefined) {
                throw new Error('does not exist')
            }
            return streamParts
        })
        operatorFleetState = new EventEmitter3()
        maintainTopologyHelper = new EventEmitter3()
        assigments = new StreamPartAssignments(
            MY_NODE_ID,
            1,
            getStreamParts,
            operatorFleetState,
            maintainTopologyHelper
        )
        events = eventsWithArgsToArray(assigments as any, ['assigned', 'unassigned'])
    })

    it('no events emitted if no assigned streams', async () => {
        operatorFleetState.emit('added', N1)
        operatorFleetState.emit('added', N2)
        operatorFleetState.emit('removed', N2)
        await wait(0)
        expect(events).toEqual([])
    })

    it('no events emitted if removing unassigned stream', async () => {
        maintainTopologyHelper.emit('removeStakedStream', S1)
        await wait(0)
        expect(events).toEqual([])
    })

    it('no events emitted if assigning non-existing stream (also does not crash)', async () => {
        maintainTopologyHelper.emit('addStakedStreams', [NON_EXISTING_STREAM])
        await wait(0)
        expect(events).toEqual([])
    })

    it('getMyStreamParts returns empty array if no assigned streams', () => {
        expect(assigments.getMyStreamParts()).toEqual([])
    })

    it('all streams get assigned to myself if no other nodes present', async () => {
        maintainTopologyHelper.emit('addStakedStreams', [S1, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        await wait(0)
        expect(events).toEqual([
            ['assigned', toStreamPartID(S1, 0)],
            ['assigned', toStreamPartID(S1, 1)],
            ['assigned', toStreamPartID(S2, 0)],
            ['assigned', toStreamPartID(S3, 0)],
            ['assigned', toStreamPartID(S3, 1)],
            ['assigned', toStreamPartID(S3, 2)]
        ])

        expect(assigments.getMyStreamParts()).toIncludeSameMembers([
            ...streamPartMappings.get(S1)!,
            ...streamPartMappings.get(S2)!,
            ...streamPartMappings.get(S3)!
        ])
    })

    it('unassigning a stream with only me present', async () => {
        maintainTopologyHelper.emit('addStakedStreams', [S1, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        await wait(0)
        clearEvents()

        maintainTopologyHelper.emit('removeStakedStream', S1)
        await wait(0)
        expect(events).toEqual([
            ['unassigned', toStreamPartID(S1, 0)],
            ['unassigned', toStreamPartID(S1, 1)]
        ])

        expect(assigments.getMyStreamParts()).toIncludeSameMembers([
            ...streamPartMappings.get(S2)!,
            ...streamPartMappings.get(S3)!
        ])
    })

    it('adding nodes in the presence of streams', async () => {
        maintainTopologyHelper.emit('addStakedStreams', [S1, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        maintainTopologyHelper.emit('addStakedStreams', [S4])
        await wait(0)
        clearEvents()

        operatorFleetState.emit('added', N1)
        await wait(0)
        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['unassigned', toStreamPartID(S3, 1)],
            ['unassigned', toStreamPartID(S3, 2)]
        ])

        expect(assigments.getMyStreamParts()).toIncludeSameMembers([
            ...streamPartMappings.get(S1)!,
            ...streamPartMappings.get(S2)!,
            toStreamPartID(S3, 0),
            ...streamPartMappings.get(S4)!,
        ])
    })

    it('removing nodes in the presence of streams', async () => {
        operatorFleetState.emit('added', N1)
        await wait(0)
        maintainTopologyHelper.emit('addStakedStreams', [S1, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        maintainTopologyHelper.emit('addStakedStreams', [S4])
        await wait(0)
        clearEvents()

        operatorFleetState.emit('removed', N1)
        await wait(0)
        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['assigned', toStreamPartID(S3, 1)],
            ['assigned', toStreamPartID(S3, 2)]
        ])

        expect(assigments.getMyStreamParts()).toIncludeSameMembers([...streamPartMappings.values()].flat())
    })

    it('stream assignments in the presence of other nodes', async () => {
        operatorFleetState.emit('added', N1)
        operatorFleetState.emit('added', N2)
        await wait(0)
        maintainTopologyHelper.emit('addStakedStreams', [S4, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        await wait(0)

        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['assigned', toStreamPartID(S4, 0)],
            ['assigned', toStreamPartID(S3, 0)]
        ])

        expect(assigments.getMyStreamParts()).toEqual([
            toStreamPartID(S4, 0),
            toStreamPartID(S3, 0)
        ])
    })

    it('stream unassignments in the presence of other nodes', async () => {
        operatorFleetState.emit('added', N1)
        operatorFleetState.emit('added', N2)
        await wait(0)
        maintainTopologyHelper.emit('addStakedStreams', [S4, S2])
        maintainTopologyHelper.emit('addStakedStreams', [S3])
        await wait(0)
        clearEvents()

        maintainTopologyHelper.emit('removeStakedStream', S3)
        await wait(0)

        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['unassigned', toStreamPartID(S3, 0)]
        ])
    })

    it('concurrency is handled appropriately', async () => {
        const ROUNDS = 10
        for (let i = 0; i < ROUNDS; ++i) {
            maintainTopologyHelper.emit('addStakedStreams', [S3])
            maintainTopologyHelper.emit('removeStakedStream', S3)
        }
        await wait(0)
        expect(events).toEqual(range(ROUNDS).map(() => {
            return [
                ['assigned', toStreamPartID(S3, 0)],
                ['assigned', toStreamPartID(S3, 1)],
                ['assigned', toStreamPartID(S3, 2)],
                ['unassigned', toStreamPartID(S3, 0)],
                ['unassigned', toStreamPartID(S3, 1)],
                ['unassigned', toStreamPartID(S3, 2)],
            ]
        }).flat())
    })

    // TODO: test with multiple StreamPartAssignments instances, verify that partitioning is complete
})
