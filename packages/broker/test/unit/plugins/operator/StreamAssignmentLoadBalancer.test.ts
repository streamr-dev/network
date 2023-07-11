import { StreamAssignmentLoadBalancer } from '../../../../src/plugins/operator/StreamAssignmentLoadBalancer'
import { Stream } from 'streamr-client'
import EventEmitter3 from 'eventemitter3'
import { OperatorFleetStateEvents } from '../../../../src/plugins/operator/OperatorFleetState'
import { MaintainTopologyHelperEvents } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { eventsWithArgsToArray } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import range from 'lodash/range'

const MY_NODE_ID = 'node0'

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

describe(StreamAssignmentLoadBalancer, () => {
    let events: [string, ...any[]][]
    let operatorFleetState: EventEmitter3<OperatorFleetStateEvents>
    let maintainTopologyHelper: EventEmitter3<MaintainTopologyHelperEvents>
    let balancer: StreamAssignmentLoadBalancer

    function clearEvents(): void {
        events.length = 0
    }

    beforeEach(() => {
        const getStream = jest.fn<Promise<Stream>, [string]>()
        getStream.mockImplementation(async (streamId) => {
            const streamParts = streamPartMappings.get(toStreamID(streamId))
            if (streamParts === undefined) {
                throw new Error('does not exist')
            } else {
                return { getStreamParts: () => streamParts } as Pick<Stream, 'getStreamParts'> as any
            }
        })
        operatorFleetState = new EventEmitter3()
        maintainTopologyHelper = new EventEmitter3()
        balancer = new StreamAssignmentLoadBalancer(
            MY_NODE_ID,
            getStream,
            operatorFleetState,
            maintainTopologyHelper
        )
        events = eventsWithArgsToArray(balancer as any, ['assigned', 'unassigned'])
    })

    it('no events emitted if no assigned streams', async () => {
        operatorFleetState.emit('added', 'node1')
        operatorFleetState.emit('added', 'node2')
        operatorFleetState.emit('removed', 'node2')
        await wait(0)
        expect(events).toEqual([])
    })

    it('no events emitted if removing unassigned stream', async () => {
        maintainTopologyHelper.emit('removeStakedStream', S1)
        await wait(0)
        expect(events).toEqual([])
    })

    it('no events emitted if assigning non-existing stream (also does not crash)', async () => {
        maintainTopologyHelper.emit('addStakedStream', [NON_EXISTING_STREAM])
        await wait(0)
        expect(events).toEqual([])
    })

    it('all streams get assigned to myself if no other nodes present', async () => {
        maintainTopologyHelper.emit('addStakedStream', [S1, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        await wait(0)
        expect(events).toEqual([
            ['assigned', toStreamPartID(S1, 0)],
            ['assigned', toStreamPartID(S1, 1)],
            ['assigned', toStreamPartID(S2, 0)],
            ['assigned', toStreamPartID(S3, 0)],
            ['assigned', toStreamPartID(S3, 1)],
            ['assigned', toStreamPartID(S3, 2)]
        ])
    })

    it('unassigning a stream with only me present', async () => {
        maintainTopologyHelper.emit('addStakedStream', [S1, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        await wait(0)
        clearEvents()

        maintainTopologyHelper.emit('removeStakedStream', S1)
        await wait(0)
        expect(events).toEqual([
            ['unassigned', toStreamPartID(S1, 0)],
            ['unassigned', toStreamPartID(S1, 1)]
        ])
    })

    it('adding nodes in the presence of streams', async () => {
        maintainTopologyHelper.emit('addStakedStream', [S1, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        maintainTopologyHelper.emit('addStakedStream', [S4])
        await wait(0)
        clearEvents()

        operatorFleetState.emit('added', 'node1')
        await wait(0)
        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['unassigned', toStreamPartID(S3, 1)],
            ['unassigned', toStreamPartID(S3, 2)]
        ])
    })

    it('removing nodes in the presence of streams', async () => {
        operatorFleetState.emit('added', 'node1')
        await wait(0)
        maintainTopologyHelper.emit('addStakedStream', [S1, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        maintainTopologyHelper.emit('addStakedStream', [S4])
        await wait(0)
        clearEvents()

        operatorFleetState.emit('removed', 'node1')
        await wait(0)
        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['assigned', toStreamPartID(S3, 1)],
            ['assigned', toStreamPartID(S3, 2)]
        ])
    })

    it('stream assignments in the presence of other nodes', async () => {
        operatorFleetState.emit('added', 'node1')
        operatorFleetState.emit('added', 'node2')
        await wait(0)
        maintainTopologyHelper.emit('addStakedStream', [S4, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        await wait(0)

        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['assigned', toStreamPartID(S4, 0)],
            ['assigned', toStreamPartID(S3, 0)]
        ])
    })

    it('stream unassignments in the presence of other nodes', async () => {
        operatorFleetState.emit('added', 'node1')
        operatorFleetState.emit('added', 'node2')
        await wait(0)
        maintainTopologyHelper.emit('addStakedStream', [S4, S2])
        maintainTopologyHelper.emit('addStakedStream', [S3])
        await wait(0)
        clearEvents()

        maintainTopologyHelper.emit('removeStakedStream', S3)
        await wait(0)

        expect(events).toEqual([ // expectation based on arbitrary hashing
            ['unassigned', toStreamPartID(S3, 0)]
        ])
    })

    // TODO: all-out test with concurrency and multiple balancers
})
