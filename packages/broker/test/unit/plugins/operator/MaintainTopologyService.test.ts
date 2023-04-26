import { MaintainTopologyService } from '../../../../src/plugins/operator/MaintainTopologyService'
import { FakeOperatorClient } from '../../../../src/plugins/operator/FakeOperatorClient'
import { StreamID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { mock, MockProxy } from 'jest-mock-extended'
import StreamrClient, { Subscription } from 'streamr-client'
import range from 'lodash/range'
import { wait, waitForCondition } from '@streamr/utils'

interface Fixture {
    partitions: number
    subscriptions: { unsubscribe: jest.MockedFn<Subscription['unsubscribe']> }[]
}

const STREAM_A = toStreamID('STREAM_A')
const STREAM_B = toStreamID('STREAM_B')
const STREAM_C = toStreamID('STREAM_C')
const STREAM_D = toStreamID('STREAM_D')
const STREAM_E = toStreamID('STREAM_E')
const STREAM_F = toStreamID('STREAM_F')
const STREAM_NOT_EXIST = toStreamID('STREAM_NOT_EXIST')

const NOTHING_HAPPENED_DELAY = 100

function setUpFixturesAndMocks(streamrClient: MockProxy<StreamrClient>): Record<string, Fixture> {
    const result: Record<string, Fixture> = {
        STREAM_A: { partitions: 1, subscriptions: [] },
        STREAM_B: { partitions: 3, subscriptions: [] },
        STREAM_C: { partitions: 2, subscriptions: [] },
        STREAM_D: { partitions: 2, subscriptions: [] },
        STREAM_E: { partitions: 1, subscriptions: [] },
        STREAM_F: { partitions: 4, subscriptions: [] },
        STREAM_NOT_EXIST: { partitions: 3, subscriptions: [] } // subscriptions should never be invoked!
    }

    // Set up streamrClient#subscribe
    for (const [streamId, { partitions }] of Object.entries(result)) {
        result[streamId].subscriptions = range(partitions).map(() => ({ unsubscribe: jest.fn() } as any))
    }
    streamrClient.subscribe.mockImplementation(async (opts) => {
        return result[(opts as any).id].subscriptions[(opts as any).partition] as any
    })

    // Set up streamrClient#getStream
    for (const [streamId, { partitions }] of Object.entries(result)) {
        streamrClient.getStream.calledWith(streamId).mockResolvedValue({
            getStreamParts: () => range(partitions).map((p) => toStreamPartID(toStreamID(streamId), p))
        } as any)
    }
    streamrClient.getStream.calledWith(STREAM_NOT_EXIST).mockRejectedValue(new Error('non-existing stream'))

    return result
}

const formRawSubscriptionParam = (id: StreamID, partition: number) => ({ id, partition, raw: true })

describe('MaintainTopologyService', () => {
    let streamrClient: MockProxy<StreamrClient>
    let fixtures: Record<string, Fixture>
    let operatorClient: FakeOperatorClient
    let service: MaintainTopologyService

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        fixtures = setUpFixturesAndMocks(streamrClient)
    })

    async function setUpAndStart(initialState: StreamID[]): Promise<void> {
        operatorClient = new FakeOperatorClient(initialState)
        service = new MaintainTopologyService(streamrClient, operatorClient)
        await service.start()
    }

    it('subscribes to nothing given empty state at start', async () => {
        await setUpAndStart([])

        expect(streamrClient.subscribe).toHaveBeenCalledTimes(0)
    })

    it('subscribes to initial state on start', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        expect(streamrClient.subscribe).toHaveBeenCalledTimes(1 + 3 + 2)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_A, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 1))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_B, 2))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 1))
    })

    it('ignores non-existing streams on start', async () => {
        await setUpAndStart([STREAM_A, STREAM_NOT_EXIST, STREAM_C])

        expect(streamrClient.subscribe).toHaveBeenCalledTimes(1 + 2)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_A, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_C, 1))
    })

    it('handles addStakedStream event (happy path)', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])
        streamrClient.subscribe.mockClear()

        operatorClient.addStreamToState(STREAM_D)

        await waitForCondition(() => streamrClient.subscribe.mock.calls.length >= 2)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(2)
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_D, 0))
        expect(streamrClient.subscribe).toBeCalledWith(formRawSubscriptionParam(STREAM_D, 1))
    })

    it('handles addStakedStream event given non-existing stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])
        streamrClient.getStream.mockClear()
        streamrClient.subscribe.mockClear()

        operatorClient.addStreamToState(STREAM_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(0)
    })

    it('handles addStakedStream event given already subscribed stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])
        streamrClient.subscribe.mockClear()

        operatorClient.addStreamToState(STREAM_B)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(streamrClient.subscribe).toHaveBeenCalledTimes(0)
    })

    // TODO: client#subscribe throw on initial poll or event

    function totalUnsubscribes(streamID: StreamID): number {
        return fixtures[streamID]
            .subscriptions
            .reduce((total, sub) => total + sub.unsubscribe.mock.calls.length, 0)
    }

    it('handles removeStakedStream event (happy path)', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        operatorClient.removeStreamFromState(STREAM_C)

        await waitForCondition(() => totalUnsubscribes(STREAM_C) >= 2)
        expect(fixtures[STREAM_C].subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
        expect(fixtures[STREAM_C].subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('handles removeStakedStream event once even if triggered twice', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        operatorClient.removeStreamFromState(STREAM_C)
        operatorClient.removeStreamFromState(STREAM_C)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_C)).toEqual(2)
        expect(fixtures[STREAM_C].subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
        expect(fixtures[STREAM_C].subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('handles removeStakedStream event given non-existing stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        operatorClient.removeStreamFromState(STREAM_NOT_EXIST)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_NOT_EXIST)).toEqual(0)
    })

    it('handles removeStakedStream event given not subscribed stream', async () => {
        await setUpAndStart([STREAM_A, STREAM_B, STREAM_C])

        operatorClient.removeStreamFromState(STREAM_D)

        await wait(NOTHING_HAPPENED_DELAY)
        expect(totalUnsubscribes(STREAM_D)).toEqual(0)
    })
})
