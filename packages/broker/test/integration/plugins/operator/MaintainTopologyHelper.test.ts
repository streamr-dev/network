import { Contract } from '@ethersproject/contracts'
import { parseEther } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import type { Operator, TestToken } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { createClient, createTestStream } from '../../../utils'
import { deploySponsorshipContract, getTokenContract, setupOperatorContract } from './contractUtils'

jest.setTimeout(60 * 1000)

describe('MaintainTopologyHelper', () => {

    let token: TestToken
    let streamId1: string
    let streamId2: string

    beforeAll(async () => {
        token = getTokenContract()
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()
    })

    describe('normal workflow', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract())
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('client emits events when sponsorships are staked', async () => {
            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            topologyHelper.on('addStakedStreams', () => {
                eventcount += 1
            })
            await topologyHelper.start()

            sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId1 })
            sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId2 })

            // delegating
            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

            await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()
            await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

            await waitForCondition(() => eventcount === 2, 10000, 1000)

            topologyHelper.stop()
        })

        it('client returns all streams from theGraph on initial startup as event', async () => {
            await wait(5000)
            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                streams = streams.concat(streamid)
            })

            await topologyHelper.start()
            await wait(3000)
            expect(streams.length).toEqual(2)
            expect(streams).toContain(streamId1)
            expect(streams).toContain(streamId2)

            topologyHelper.stop()
        })

        it('client catches onchain events and emits join and leave events', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            topologyHelper.on('removeStakedStream', () => {
                eventcount += 1
            })
            await topologyHelper.start()
            await wait(2000)

            await (await operatorContract.unstake(sponsorship1.address)).wait()
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => eventcount === 2, 10000, 1000)
            topologyHelper.stop()
        })
    })

    describe('edge cases', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract())
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('edge cases, 2 sponsorships for the same stream, join only fired once', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let receivedAddStreams = 0
            topologyHelper.on('addStakedStreams', () => {
                receivedAddStreams += 1
            })
            await wait(2000)
            await topologyHelper.start()

            sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId1 })
            sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId1 })

            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

            await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)
            await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)

            await wait(10000) // wait for events to be processed

            topologyHelper.stop()

        })

        it('only returns the stream from getAllStreams when staked on 2 sponsorships for the stream', async () => {

            const operatorClient = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            operatorClient.on('addStakedStreams', (streamIDs: string[]) => {
                streams = streamIDs
            })
            await operatorClient.start()
            await waitForCondition(() => streams.length === 1, 10000, 1000)
            expect(streams).toContain(streamId1)
            operatorClient.stop()
        })

        it('edge cases, 2 sponsorships for the same stream, remove only fired once', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let receivedRemoveStreams = 0
            topologyHelper.on('removeStakedStream', () => {
                receivedRemoveStreams += 1
            })
            await topologyHelper.start()

            await wait(3000)

            await (await operatorContract.unstake(sponsorship1.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 0, 10000, 1000)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 1, 10000, 1000)

            topologyHelper.stop()
        })
    })
})
