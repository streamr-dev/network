import { toStreamID } from '@streamr/protocol'
import { OperatorContractFacade } from '@streamr/sdk'
import { eventsWithArgsToArray, randomEthereumAddress } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import EventEmitter3 from 'eventemitter3'
import { MockProxy, mock } from 'jest-mock-extended'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'

const fromArray = async function* <T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) {
        yield item
    }
}

const STREAM_ONE_ID = toStreamID('streamOne')
const STREAM_TWO_ID = toStreamID('streamTwo')
const SPONSORSHIP_ONE = randomEthereumAddress()
const SPONSORSHIP_TWO = randomEthereumAddress()

describe(MaintainTopologyHelper, () => {
    let smartContractEventEmitter: EventEmitter3
    let contractFacade: MockProxy<OperatorContractFacade>
    let helper: MaintainTopologyHelper

    async function triggerEventHandler(event: 'Staked' | 'Unstaked', sponsorship: string): Promise<void> {
        smartContractEventEmitter.emit(event, sponsorship)
        await wait(0)
    }

    beforeEach(() => {
        smartContractEventEmitter = new EventEmitter3()
        contractFacade = mock<OperatorContractFacade>()
        contractFacade.addOperatorContractStakeEventListener
            .mockImplementation(smartContractEventEmitter.on.bind(smartContractEventEmitter))
        helper = new MaintainTopologyHelper(contractFacade)
    })

    describe('given two sponsorships pointing to different streams', () => {
        beforeEach(() => {
            contractFacade.pullStakedStreams.mockReturnValue(fromArray([]))
            contractFacade.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            contractFacade.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_TWO_ID)
        })

        it('emits "addStakedStreams" twice when staking to both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            await triggerEventHandler('Staked', SPONSORSHIP_ONE)
            await triggerEventHandler('Staked', SPONSORSHIP_TWO)

            expect(events).toEqual([
                ['addStakedStreams', [STREAM_ONE_ID]],
                ['addStakedStreams', [STREAM_TWO_ID]]
            ])
        })

        it('emits "removeStakedStream" twice when unstaking from both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('Staked', SPONSORSHIP_ONE)
            await triggerEventHandler('Staked', SPONSORSHIP_TWO)

            await triggerEventHandler('Unstaked', SPONSORSHIP_ONE)
            await triggerEventHandler('Unstaked', SPONSORSHIP_TWO)
            expect(events).toEqual([
                ['removeStakedStream', STREAM_ONE_ID],
                ['removeStakedStream', STREAM_TWO_ID]
            ])
        })
    })

    describe('given two sponsorships pointing to the same stream', () => {
        beforeEach(() => {
            contractFacade.pullStakedStreams.mockReturnValue(fromArray([]))
            contractFacade.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            contractFacade.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_ONE_ID)
        })

        it('emits "addStakedStreams" only once when staking to both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            await triggerEventHandler('Staked', SPONSORSHIP_ONE)
            await triggerEventHandler('Staked', SPONSORSHIP_TWO)

            expect(events).toEqual([
                ['addStakedStreams', [STREAM_ONE_ID]]
            ])
        })

        it('emits "removeStakedStream" only once and only after unstaking from both', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('Staked', SPONSORSHIP_ONE)
            await triggerEventHandler('Staked', SPONSORSHIP_TWO)

            await triggerEventHandler('Unstaked', SPONSORSHIP_ONE)
            expect(events).toEqual([])

            await triggerEventHandler('Unstaked', SPONSORSHIP_TWO)
            expect(events).toEqual([
                ['removeStakedStream', STREAM_ONE_ID]
            ])
        })
    })

    describe('interaction with initially pulled staked streams', () => {
        const SPONSORSHIP_THREE = randomEthereumAddress()
        const SPONSORSHIP_FOUR = randomEthereumAddress()
        const SPONSORSHIP_FIVE = randomEthereumAddress()
        const SPONSORSHIP_SIX = randomEthereumAddress()

        const STREAM_THREE_ID = toStreamID('streamThree')

        beforeEach(() => {
            contractFacade.pullStakedStreams.mockReturnValue(fromArray([
                {
                    sponsorship: {
                        id: SPONSORSHIP_THREE,
                        stream: {
                            id: STREAM_ONE_ID
                        }
                    }
                },
                {
                    sponsorship: {
                        id: SPONSORSHIP_FOUR,
                        stream: {
                            id: STREAM_TWO_ID
                        }
                    }
                },
                {
                    sponsorship: {
                        id: SPONSORSHIP_FIVE,
                        stream: {
                            id: STREAM_ONE_ID
                        }
                    }
                }
            ]))

            contractFacade.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ONE_ID)
            contractFacade.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_TWO_ID)
            contractFacade.getStreamId.calledWith(SPONSORSHIP_SIX).mockResolvedValue(STREAM_THREE_ID)
        })

        it('emits "addStakedStreams" for initially pulled stakes (ignoring duplicate streams)', async () => {
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
            await helper.start()

            expect(events).toEqual([
                ['addStakedStreams', [STREAM_ONE_ID, STREAM_TWO_ID]]
            ])
        })

        it('event "addStakedStreams" is not emitted thereafter if staking to an already staked stream', async () => {
            await helper.start()
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])

            await triggerEventHandler('Staked', SPONSORSHIP_ONE)

            expect(events).toEqual([])
        })

        it('event "addStakedStreams" is emitted thereafter if staking to a non-staked stream', async () => {
            await helper.start()
            const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])

            await triggerEventHandler('Staked', SPONSORSHIP_SIX)

            expect(events).toEqual([
                ['addStakedStreams', [STREAM_THREE_ID]]
            ])
        })

        it('event "removeStakedStream" is emitted once and only after unstaking from all the sponsorships related to the stream', async () => {
            const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
            await helper.start()

            await triggerEventHandler('Staked', SPONSORSHIP_ONE) // 3 sponsorships after this point (2 from pull, 1 from event)

            await triggerEventHandler('Unstaked', SPONSORSHIP_ONE)
            expect(events).toEqual([])

            await triggerEventHandler('Unstaked', SPONSORSHIP_FIVE)
            expect(events).toEqual([])

            await triggerEventHandler('Unstaked', SPONSORSHIP_THREE)
            expect(events).toEqual([
                ['removeStakedStream', STREAM_ONE_ID]
            ])
        })
    })
})
