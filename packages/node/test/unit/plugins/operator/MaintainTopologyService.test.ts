import type { StreamrClient, Subscription } from '@streamr/sdk'
import { StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID, wait, until } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { MockProxy, mock } from 'jest-mock-extended'
import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import { StreamPartAssignmentEvents } from '../../../../src/plugins/operator/StreamPartAssignments'

interface MockSubscription {
    unsubscribe: jest.MockedFn<Subscription['unsubscribe']>
}

const SP1 = toStreamPartID(toStreamID('aa'), 0)
const SP2 = toStreamPartID(toStreamID('aa'), 1)
const SP3 = toStreamPartID(toStreamID('bb'), 4)
const SP4 = toStreamPartID(toStreamID('cc'), 0)
const SP5 = toStreamPartID(toStreamID('cc'), 5)
const STREAM_NOT_EXIST = toStreamID('STREAM_NOT_EXIST')
const STREAM_PART_NOT_EXIST = toStreamPartID(STREAM_NOT_EXIST, 1)

const ALL_STREAM_PARTS = [SP1, SP2, SP3, SP4, SP5, STREAM_PART_NOT_EXIST]

const NOTHING_HAPPENED_DELAY = 250

function setUpFixturesAndMocks(streamrClient: MockProxy<StreamrClient>): Record<StreamPartID, MockSubscription> {
    const result: Record<StreamPartID, MockSubscription> = {}

    // Set up streamrClient#subscribe
    for (const streamPartId of ALL_STREAM_PARTS) {
        result[streamPartId] = { unsubscribe: jest.fn() }
    }
    streamrClient.subscribe.mockImplementation(async (opts) => {
        if ((opts as any).id === STREAM_NOT_EXIST) {
            throw new Error('non-existing stream')
        }
        return result[toStreamPartID(toStreamID((opts as any).id), (opts as any).partition)] as any
    })

    return result
}

const formRawSubscriptionParam = (streamPartId: StreamPartID) => ({
    id: StreamPartIDUtils.getStreamID(streamPartId),
    partition: StreamPartIDUtils.getStreamPartition(streamPartId),
    raw: true
})

describe('MaintainTopologyService', () => {
    let streamrClient: MockProxy<StreamrClient>
    let fixtures: Record<StreamPartID, MockSubscription>
    let assignments: EventEmitter<StreamPartAssignmentEvents>

    beforeEach(async () => {
        streamrClient = mock<StreamrClient>()
        fixtures = setUpFixturesAndMocks(streamrClient)
        assignments = new EventEmitter()
        new MaintainTopologyService(streamrClient, assignments as any)
    })

    it('handles "assigned" event (happy path)', async () => {
        assignments.emit('assigned', SP1)
        assignments.emit('assigned', SP2)

        await until(() => streamrClient.subscribe.mock.calls.length >= 2)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(2)
        expect(streamrClient.subscribe.mock.calls[0][0]).toEqual(formRawSubscriptionParam(SP1))
        expect(streamrClient.subscribe.mock.calls[1][0]).toEqual(formRawSubscriptionParam(SP2))
    })

    it('handles "assigned" event given non-existing stream (does not crash)', async () => {
        assignments.emit('assigned', STREAM_PART_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(1)
    })

    function totalUnsubscribes(streamPartId: StreamPartID): number {
        return fixtures[streamPartId].unsubscribe.mock.calls.length
    }

    it('handles "unassigned" event (happy path)', async () => {
        assignments.emit('assigned', SP1)
        assignments.emit('assigned', SP2)

        assignments.emit('unassigned', SP1)

        await until(() => totalUnsubscribes(SP1) === 1)
        expect(totalUnsubscribes(SP2)).toEqual(0)
    })

    it('handles "unassigned" event given non-existing stream', async () => {
        assignments.emit('unassigned', STREAM_PART_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_PART_NOT_EXIST)).toEqual(0)
    })

    it('handles concurrency properly', async () => {
        assignments.emit('assigned', SP3)

        for (let i = 1; i < 21; i += 2) {
            assignments.emit('unassigned', SP3)
            assignments.emit('assigned', SP3)
        }

        await until(
            () => totalUnsubscribes(SP3) >= 10,
            undefined,
            undefined,
            undefined,
            () => `was ${totalUnsubscribes(SP3)}`
        )
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(1 + 10)
    })
})
