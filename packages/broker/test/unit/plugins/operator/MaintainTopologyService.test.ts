import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import { FakeOperatorClient as FakeMaintainTopologyHelper } from '../../../../src/plugins/operator/FakeOperatorClient'
import { StreamID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { mock, MockProxy } from 'jest-mock-extended'
import StreamrClient, { Subscription } from 'streamr-client'
import range from 'lodash/range'
import { wait, waitForCondition } from '@streamr/utils'

interface MockSubscription {
    unsubscribe: jest.MockedFn<Subscription['unsubscribe']>
}

const STREAM_A = toStreamID('STREAM_A')
const STREAM_B = toStreamID('STREAM_B')
const STREAM_C = toStreamID('STREAM_C')
const STREAM_D = toStreamID('STREAM_D')
const STREAM_E = toStreamID('STREAM_E')
const STREAM_F = toStreamID('STREAM_F')
const STREAM_NOT_EXIST = toStreamID('STREAM_NOT_EXIST')

const STREAM_PARTITIONS: Record<StreamID, number> = Object.freeze({
    [STREAM_A]: 1,
    [STREAM_B]: 3,
    [STREAM_C]: 2,
    [STREAM_D]: 2,
    [STREAM_E]: 1,
    [STREAM_F]: 4,
    [STREAM_NOT_EXIST]: 3
})

const NOTHING_HAPPENED_DELAY = 250

function setUpFixturesAndMocks(streamrClient: MockProxy<StreamrClient>): Record<StreamID, MockSubscription[]> {
    const result: Record<StreamID, MockSubscription[]> = {}

    // Set up streamrClient#subscribe
    for (const [streamId, partitions] of Object.entries(STREAM_PARTITIONS)) {
        result[toStreamID(streamId)] = range(partitions).map(() => ({ unsubscribe: jest.fn() }))
    }
    streamrClient.subscribe.mockImplementation(async (opts) => {
        return result[(opts as any).id][(opts as any).partition] as any
    })

    // Set up streamrClient#getStream
    for (const [streamId, partitions] of Object.entries(STREAM_PARTITIONS)) {
        streamrClient.getStream.calledWith(streamId).mockResolvedValue({
            getStreamParts: () => range(partitions).map((p) => toStreamPartID(toStreamID(streamId), p))
        } as any)
    }
    streamrClient.getStream.calledWith(STREAM_NOT_EXIST).mockRejectedValue(new Error('non-existing stream'))

    return result
}

const formRawSubscriptionParam = (id: StreamID, partition: number) => ({ id, partition, raw: true })

const INITIAL_BLOCK = 10

describe('MaintainTopologyService', () => {
    let streamrClient: MockProxy<StreamrClient>
    let fixtures: Record<string, MockSubscription[]>
    let fakeMaintainTopologyHelper: FakeMaintainTopologyHelper
    let service: MaintainTopologyService

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        fixtures = setUpFixturesAndMocks(streamrClient)
    })

    async function setUpAndStart(initialState: StreamID[]): Promise<void> {
        fakeMaintainTopologyHelper = new FakeMaintainTopologyHelper(initialState, INITIAL_BLOCK)
        service = new MaintainTopologyService(streamrClient, fakeMaintainTopologyHelper as any)
        await service.start()
    }

    it('subscribes to nothing given empty state at start', async () => {
        await setUpAndStart([])

        expect(streamrClient.subscribe).toHaveBeenCalledTimes(0)
    })

    it('subscribes to initial state on start', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        await waitForCondition(() => streamrClient.subscribe.mock.calls.length == 6)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_A, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 1))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 2))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 1))
    })

    it('ignores non-existing streams on start', async () => {
        await setUpAndStart([STREAM_A, STREAM_NOT_EXIST, STREAM_C])

        // expect(streamrClient.subscribe).toHaveBeenCalledTimes(1 + 2)
        await waitForCondition(() => streamrClient.subscribe.mock.calls.length == 3)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_A, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 1))
    })

    it('handles addStakedStream event (happy path)', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])
        await waitForCondition(() => streamrClient.subscribe.mock.calls.length == 6)
        streamrClient.subscribe.mockClear()

        fakeMaintainTopologyHelper.addStreamToState(STREAM_D)

        await waitForCondition(() => streamrClient.subscribe.mock.calls.length >= 2)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(2)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_D, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_D, 1))
    })

    it('handles addStakedStream event given non-existing stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])
        await waitForCondition(() => streamrClient.subscribe.mock.calls.length == 6)
        streamrClient.subscribe.mockClear()

        fakeMaintainTopologyHelper.addStreamToState(STREAM_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(0)
    })

    // TODO: client#subscribe throw on initial poll or event

    function totalUnsubscribes(streamId: StreamID): number {
        return fixtures[streamId].reduce((total, sub) => total + sub.unsubscribe.mock.calls.length, 0)
    }

    it('handles removeStakedStream event (happy path)', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_C)

        await waitForCondition(() => totalUnsubscribes(STREAM_C) >= 2)
        expect(fixtures[STREAM_C][0].unsubscribe).toHaveBeenCalledTimes(1)
        expect(fixtures[STREAM_C][1].unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('handles removeStakedStream event for stream previously added by event (happy path)', async () => {
        await setUpAndStart([STREAM_A, STREAM_B])

        fakeMaintainTopologyHelper.addStreamToState(STREAM_C)
        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_C)

        await waitForCondition(() => totalUnsubscribes(STREAM_C) >= 2)
        expect(fixtures[STREAM_C][0].unsubscribe).toHaveBeenCalledTimes(1)
        expect(fixtures[STREAM_C][1].unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('handles removeStakedStream event once even if triggered twice', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_C)
        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_C)

        await waitForCondition(() => totalUnsubscribes(STREAM_C) >= 2)
        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_C)).toEqual(2)
        expect(fixtures[STREAM_C][0].unsubscribe).toHaveBeenCalledTimes(1)
        expect(fixtures[STREAM_C][1].unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('handles removeStakedStream event given non-existing stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_NOT_EXIST)).toEqual(0)
    })

    it('handles removeStakedStream event given not subscribed stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        fakeMaintainTopologyHelper.removeStreamFromState(STREAM_D)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_D)).toEqual(0)
    })

    it('handles concurrency properly', async () => {
        await setUpAndStart([STREAM_C])
        streamrClient.subscribe.mockClear()

        for (let i = 1; i < 21; i += 2) {
            fakeMaintainTopologyHelper.removeStreamFromState(STREAM_C)
            fakeMaintainTopologyHelper.addStreamToState(STREAM_C)
        }

        await waitForCondition(
            () => totalUnsubscribes(STREAM_C) >= 10 * 2,
            undefined,
            undefined,
            undefined,
            () => `was ${totalUnsubscribes(STREAM_C)}`
        )
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(10 * 2)
    })
})
