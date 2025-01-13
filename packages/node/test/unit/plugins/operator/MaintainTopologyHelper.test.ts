import { Operator, OperatorEvents, StakeEvent } from '@streamr/sdk'
import { eventsWithArgsToArray, randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, Multimap, toStreamID, wait } from '@streamr/utils'
import { MockProxy, mock } from 'jest-mock-extended'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'

const fromArray = async function* <T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) {
        yield item
    }
}

type StakeEventName = 'staked' | 'unstaked'

const STREAM_ONE_ID = toStreamID('streamOne')
const STREAM_TWO_ID = toStreamID('streamTwo')
const SPONSORSHIP_ONE = randomEthereumAddress()
const SPONSORSHIP_TWO = randomEthereumAddress()

describe(MaintainTopologyHelper, () => {
    let operator: MockProxy<Operator>
    let helper: MaintainTopologyHelper
    let eventListeners: Multimap<StakeEventName, (payload: StakeEvent) => void>

    async function triggerEventHandler(event: StakeEventName, sponsorship: EthereumAddress): Promise<void> {
        const listeners = eventListeners.get(event)
        for (const listener of listeners) {
            listener({
                sponsorship
            })
        }
        await wait(0)
    }

    beforeEach(() => {
        eventListeners = new Multimap()
        operator = mock<Operator>()
        const onEvent = <E extends keyof OperatorEvents>(eventName: E, listener: OperatorEvents[E]): void => {
            if (eventName === 'staked' || eventName == 'unstaked') {
                eventListeners.add(eventName, listener as (payload: StakeEvent) => void)
            }
        }
        operator.on.mockImplementation(onEvent)
        helper = new MaintainTopologyHelper(operator)
    })

    describe('given two sponsorships pointing to different streams', () => {
        beforeEach(() => {
            operator.pullStakedStreams.mockReturnValue(fromArray([]))
            operator.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            operator.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_TWO_ID)
        })

        it('emits "addStakedStreams" twice when staking to both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            await triggerEventHandler('staked', SPONSORSHIP_ONE)
            await triggerEventHandler('staked', SPONSORSHIP_TWO)

            expect(events).toEqual([
                ['addStakedStreams', [STREAM_ONE_ID]],
                ['addStakedStreams', [STREAM_TWO_ID]]
            ])
        })

        it('emits "removeStakedStream" twice when unstaking from both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('staked', SPONSORSHIP_ONE)
            await triggerEventHandler('staked', SPONSORSHIP_TWO)

            await triggerEventHandler('unstaked', SPONSORSHIP_ONE)
            await triggerEventHandler('unstaked', SPONSORSHIP_TWO)
            expect(events).toEqual([
                ['removeStakedStream', STREAM_ONE_ID],
                ['removeStakedStream', STREAM_TWO_ID]
            ])
        })
    })

    describe('given two sponsorships pointing to the same stream', () => {
        beforeEach(() => {
            operator.pullStakedStreams.mockReturnValue(fromArray([]))
            operator.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            operator.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_ONE_ID)
        })

        it('emits "addStakedStreams" only once when staking to both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            await triggerEventHandler('staked', SPONSORSHIP_ONE)
            await triggerEventHandler('staked', SPONSORSHIP_TWO)

            expect(events).toEqual([['addStakedStreams', [STREAM_ONE_ID]]])
        })

        it('emits "removeStakedStream" only once and only after unstaking from both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('staked', SPONSORSHIP_ONE)
            await triggerEventHandler('staked', SPONSORSHIP_TWO)

            await triggerEventHandler('unstaked', SPONSORSHIP_ONE)
            expect(events).toEqual([])

            await triggerEventHandler('unstaked', SPONSORSHIP_TWO)
            expect(events).toEqual([['removeStakedStream', STREAM_ONE_ID]])
        })
    })

    describe('interaction with initially pulled staked streams', () => {
        const SPONSORSHIP_THREE = randomEthereumAddress()
        const SPONSORSHIP_FOUR = randomEthereumAddress()
        const SPONSORSHIP_FIVE = randomEthereumAddress()
        const SPONSORSHIP_SIX = randomEthereumAddress()

        const STREAM_THREE_ID = toStreamID('streamThree')

        beforeEach(() => {
            operator.pullStakedStreams.mockReturnValue(
                fromArray([
                    {
                        sponsorship: SPONSORSHIP_THREE,
                        streamId: STREAM_ONE_ID
                    },
                    {
                        sponsorship: SPONSORSHIP_FOUR,
                        streamId: STREAM_TWO_ID
                    },
                    {
                        sponsorship: SPONSORSHIP_FIVE,
                        streamId: STREAM_ONE_ID
                    }
                ])
            )
            operator.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            operator.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_TWO_ID)
            operator.getStreamId.calledWith(SPONSORSHIP_SIX).mockResolvedValue(STREAM_THREE_ID)
        })

        it('emits "addStakedStreams" for initially pulled stakes (ignoring duplicate streams)', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            expect(events).toEqual([['addStakedStreams', [STREAM_ONE_ID, STREAM_TWO_ID]]])
        })

        it('event "addStakedStreams" is not emitted thereafter if staking to an already staked stream', async () => {
            await helper.start()
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])

            await triggerEventHandler('staked', SPONSORSHIP_ONE)

            expect(events).toEqual([])
        })

        it('event "addStakedStreams" is emitted thereafter if staking to a non-staked stream', async () => {
            await helper.start()
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])

            await triggerEventHandler('staked', SPONSORSHIP_SIX)

            expect(events).toEqual([['addStakedStreams', [STREAM_THREE_ID]]])
        })

        it('event "removeStakedStream" is emitted once and only after unstaking from all the sponsorships related to the stream', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('staked', SPONSORSHIP_ONE) // 3 sponsorships after this point (2 from pull, 1 from event)

            await triggerEventHandler('unstaked', SPONSORSHIP_ONE)
            expect(events).toEqual([])

            await triggerEventHandler('unstaked', SPONSORSHIP_FIVE)
            expect(events).toEqual([])

            await triggerEventHandler('unstaked', SPONSORSHIP_THREE)
            expect(events).toEqual([['removeStakedStream', STREAM_ONE_ID]])
        })
    })
})
