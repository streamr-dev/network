import { Contract } from '@ethersproject/contracts'
import { Wallet } from '@ethersproject/wallet'
import type { Operator } from '@streamr/network-contracts'
import { eventsToArray, eventsWithArgsToArray, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { createClient, createTestStream } from '../../../utils'
import { delegate, deploySponsorshipContract, setupOperatorContract, stake, unstake } from './contractUtils'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'

const TIMEOUT = 30 * 1000
const WAIT_FOR_EVENTS_IN_MS = 10 * 1000
const WAIT_FOR_EVENT_HANDLERS_TO_REGISTER_IN_MS = 4000

async function runWhileWaiting<T>(task: () => Promise<T>, minElapsedTimeInMs: number): Promise<T> {
    const startTimestamp = Date.now()
    const result = await task()
    const timeLeft = minElapsedTimeInMs - (Date.now() - startTimestamp)
    if (timeLeft > 0) {
        await wait(timeLeft)
    }
    return result
}

describe(MaintainTopologyHelper, () => {
    let streamId1: string
    let streamId2: string

    beforeAll(async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()
    }, TIMEOUT)

    describe('two different streams included in two sponsorships', () => {
        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorServiceConfig: Omit<OperatorServiceConfig, 'signer'>
        let nodeWallet: Wallet
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            ({
                operatorWallet,
                operatorContract,
                operatorServiceConfig,
                nodeWallets: [nodeWallet]
            } = await setupOperatorContract({ nodeCount: 1 }))
        }, TIMEOUT)

        beforeEach(() => {
            topologyHelper = new MaintainTopologyHelper(ContractFacade.createInstance({
                ...operatorServiceConfig,
                signer: nodeWallet
            }))
        })

        afterEach(async () => {
            topologyHelper.stop()
        })

        it('emits events when sponsorships are staked to', async () => {
            const events = eventsToArray(topologyHelper as any, ['addStakedStreams'])
            await topologyHelper.start()

            await runWhileWaiting(async () => {
                sponsorship1 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })
                sponsorship2 = await deploySponsorshipContract({ streamId: streamId2, deployer: operatorWallet })
                await delegate(operatorWallet, operatorContract.address, 20000)
            }, WAIT_FOR_EVENT_HANDLERS_TO_REGISTER_IN_MS)

            await stake(operatorContract, sponsorship1.address, 10000)
            await stake(operatorContract, sponsorship2.address, 10000)

            await waitForCondition(() => events.length >= 2, WAIT_FOR_EVENTS_IN_MS)
            expect(events.length).toEqual(2)
        }, TIMEOUT)

        it('emits events for existing sponsorship stakes on start', async () => {
            const events = eventsWithArgsToArray(topologyHelper as any, ['addStakedStreams'])
            await topologyHelper.start()

            expect(events.length).toEqual(1)
            expect(events[0][1]).toIncludeSameMembers([streamId1, streamId2])
        }, TIMEOUT)

        it('emits events when sponsorships are (fully) un-staked from', async () => {
            const events = eventsToArray(topologyHelper as any, ['removeStakedStream'])
            await topologyHelper.start()
            await wait(WAIT_FOR_EVENT_HANDLERS_TO_REGISTER_IN_MS)

            await unstake(operatorContract, sponsorship1.address)
            await unstake(operatorContract, sponsorship2.address)

            await waitForCondition(() => events.length >= 2, WAIT_FOR_EVENTS_IN_MS)
            expect(events.length).toEqual(2)
        }, TIMEOUT)
    })
})
