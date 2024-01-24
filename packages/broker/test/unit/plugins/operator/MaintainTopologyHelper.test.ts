import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'
import { mock } from 'jest-mock-extended'
import { Provider } from '@ethersproject/providers'
import EventEmitter3 from 'eventemitter3'
import { eventsWithArgsToArray, randomEthereumAddress } from '@streamr/test-utils'
import { toStreamID } from '@streamr/protocol'
import { wait } from '@streamr/utils'

export const fromArray = async function* <T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) {
        yield item
    }
}

const STREAM_ID = toStreamID('streamOne')
const SPONSORSHIP_ONE = randomEthereumAddress()
const SPONSORSHIP_TWO = randomEthereumAddress()

describe(MaintainTopologyHelper, () => {
    let smartContractEventEmitter: EventEmitter3
    let helper: MaintainTopologyHelper

    async function emitSmartContractEvent(event: 'Staked' | 'Unstaked', sponsorship: string): Promise<void> {
        smartContractEventEmitter.emit(event, sponsorship)
        await wait(0)
    }

    beforeEach(() => {
        smartContractEventEmitter = new EventEmitter3()
        const provider = mock<Provider>()
        const contractFacade = mock<ContractFacade>()

        contractFacade.getProvider.mockReturnValue(provider)
        contractFacade.pullStakedStreams.mockReturnValue(fromArray([]))
        contractFacade.getStreamId.calledWith(SPONSORSHIP_ONE).mockResolvedValue(STREAM_ID)
        contractFacade.getStreamId.calledWith(SPONSORSHIP_TWO).mockResolvedValue(STREAM_ID)

        contractFacade.addOperatorContractStakeEventListener.mockImplementation(smartContractEventEmitter.on.bind(smartContractEventEmitter))
        helper = new MaintainTopologyHelper(contractFacade)
    })

    it('emits "addStakedStreams" only once when staking to sponsorships that point to the same stream', async () => {
        const events = eventsWithArgsToArray(helper as any, ['addStakedStreams'])
        await helper.start()

        await emitSmartContractEvent('Staked', SPONSORSHIP_ONE)
        await emitSmartContractEvent('Staked', SPONSORSHIP_TWO)

        expect(events).toEqual([
            ['addStakedStreams', [STREAM_ID]]
        ])
    })

    it('emits "removeStakedStream" event only once after unstaking from all sponsorships that point to the same stream', async () => {
        const events = eventsWithArgsToArray(helper as any, ['removeStakedStream'])
        await helper.start()

        await emitSmartContractEvent('Staked', SPONSORSHIP_ONE)
        await emitSmartContractEvent('Staked', SPONSORSHIP_TWO)

        await emitSmartContractEvent('Unstaked', SPONSORSHIP_ONE)
        expect(events).toEqual([])

        await emitSmartContractEvent('Unstaked', SPONSORSHIP_TWO)
        expect(events).toEqual([
            ['removeStakedStream', STREAM_ID]
        ])
    })
})
