import { Contract } from '@ethersproject/contracts'
import { Wallet } from '@ethersproject/wallet'
import type { Operator } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { createClient, createTestStream } from '../../../utils'
import { delegate, deploySponsorshipContract, setupOperatorContract, stake } from './contractUtils'
import { StreamrClient } from 'streamr-client'

jest.setTimeout(60 * 1000)

const waitForTheGraphToHaveIndexed = async (streamId: string, client: StreamrClient): Promise<void> => {
    await waitForCondition(async () => {
        // eslint-disable-next-line no-underscore-dangle
        for await (const _msg of client.searchStreams(streamId, undefined)) {
            return true
        }
        return false
    }, 15 * 1000, 600)
}

describe('MaintainTopologyHelper', () => {

    let streamId1: string
    let streamId2: string

    beforeAll(async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await waitForTheGraphToHaveIndexed(streamId1, client)
        await waitForTheGraphToHaveIndexed(streamId2, client)
        await client.destroy()
    })

    describe('normal workflow', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorServiceConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            const deployment = await setupOperatorContract({ nodeCount: 1 })
            operatorWallet = deployment.operatorWallet
            operatorContract = deployment.operatorContract
            operatorServiceConfig = {
                ...deployment.operatorServiceConfig,
                nodeWallet: deployment.nodeWallets[0]
            }
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('client emits events when sponsorships are staked', async () => {
            topologyHelper = new MaintainTopologyHelper(operatorServiceConfig)
            let eventcount = 0
            topologyHelper.on('addStakedStreams', () => {
                eventcount += 1
            })
            await topologyHelper.start()

            sponsorship1 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })
            sponsorship2 = await deploySponsorshipContract({ streamId: streamId2, deployer: operatorWallet })

            await delegate(operatorWallet, operatorContract.address, 200)
            await stake(operatorContract, sponsorship1.address, 100)
            await stake(operatorContract, sponsorship2.address, 100)

            await waitForCondition(() => eventcount === 2, 10000, 1000)

            topologyHelper.stop()
        })

        it('client returns all streams from theGraph on initial startup as event', async () => {
            topologyHelper = new MaintainTopologyHelper(operatorServiceConfig)
            let streams: string[] = []
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                streams = streams.concat(streamid)
            })

            await topologyHelper.start()
            expect(streams.length).toEqual(2)
            expect(streams).toContain(streamId1)
            expect(streams).toContain(streamId2)

            topologyHelper.stop()
        })

        it('client catches onchain events and emits join and leave events', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorServiceConfig)
            let eventcount = 0
            topologyHelper.on('removeStakedStream', () => {
                eventcount += 1
            })
            await topologyHelper.start()

            await (await operatorContract.unstake(sponsorship1.address)).wait()
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => eventcount === 2, 10000, 1000)
            topologyHelper.stop()
        })
    })

    describe('edge cases', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorServiceConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            const deployment = await setupOperatorContract({ nodeCount: 1 })
            operatorWallet = deployment.operatorWallet
            operatorContract = deployment.operatorContract
            operatorServiceConfig = {
                ...deployment.operatorServiceConfig,
                nodeWallet: deployment.nodeWallets[0]
            }
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('edge cases, 2 sponsorships for the same stream, join only fired once', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorServiceConfig)
            let receivedAddStreams = 0
            topologyHelper.on('addStakedStreams', () => {
                receivedAddStreams += 1
            })
            await topologyHelper.start()

            sponsorship1 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })
            sponsorship2 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })

            await delegate(operatorWallet, operatorContract.address, 200)

            await stake(operatorContract, sponsorship1.address, 100)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)
            await stake(operatorContract, sponsorship2.address, 100)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)

            topologyHelper.stop()

        })

        it('only returns the stream from getAllStreams when staked on 2 sponsorships for the stream', async () => {

            const operatorClient = new MaintainTopologyHelper(operatorServiceConfig)
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

            topologyHelper = new MaintainTopologyHelper(operatorServiceConfig)
            let receivedRemoveStreams = 0
            topologyHelper.on('removeStakedStream', () => {
                receivedRemoveStreams += 1
            })
            await topologyHelper.start()

            await (await operatorContract.unstake(sponsorship1.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 0, 10000, 1000)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 1, 10000, 1000)

            topologyHelper.stop()
        })
    })
})
