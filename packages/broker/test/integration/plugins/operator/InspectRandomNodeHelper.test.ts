import { parseEther } from '@ethersproject/units'
import type { TestToken } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, TheGraphClient, toEthereumAddress, wait, waitForCondition } from '@streamr/utils'
import fetch from 'node-fetch'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { createClient, createTestStream } from '../../../utils'
import {
    THE_GRAPH_URL,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    getTokenContract,
    setupOperatorContract
} from './contractUtils'

jest.setTimeout(600 * 1000)

describe('InspectRandomNodeHelper', () => {

    let token: TestToken
    let streamId1: string
    let streamId2: string
    let graphClient: TheGraphClient

    beforeAll(async () => {
        token = getTokenContract()

        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()

        graphClient = new TheGraphClient({
            serverUrl: THE_GRAPH_URL,
            fetch,
            logger: new Logger(module)
        })
    })

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract()
        const inspectRandomNodeHelper = new InspectRandomNodeHelper(operatorConfig)

        const sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId1 })
        const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId2 })

        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

        await waitForCondition(async (): Promise<boolean> => {
            const res = await inspectRandomNodeHelper.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address), 0)
            return res.length === 2
        }, 10000, 1000)

        const sponsorships = await inspectRandomNodeHelper.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address), 0)
        expect(sponsorships).toEqual(expect.arrayContaining([toEthereumAddress(sponsorship1.address), toEthereumAddress(sponsorship2.address)]))

        const operators = await inspectRandomNodeHelper.getOperatorsInSponsorship(toEthereumAddress(sponsorship1.address), 0)
        expect(operators).toEqual([toEthereumAddress(operatorContract.address)])
    })

    it('works to flag through the inspectRandomNodeHelper', async () => {
        const flagger = await setupOperatorContract()
        const target = await setupOperatorContract()

        const sponsorship = await deploySponsorshipContract({
            deployer: await generateWalletWithGasAndTokens(),
            streamId: streamId1
        })
        await (await token.connect(flagger.operatorWallet).approve(sponsorship.address, parseEther('500'))).wait()
        await (await sponsorship.connect(flagger.operatorWallet).sponsor(parseEther('500'))).wait()

        // each operator delegates to its operactor contract
        await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
            parseEther('200'), flagger.operatorWallet.address)).wait()
        await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
            parseEther('300'), target.operatorWallet.address)).wait()

        await wait(3000) // sometimes these stake fail, possibly when they end up in the same block
        await (await flagger.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()
        await wait(3000)
        await (await target.operatorContract.stake(sponsorship.address, parseEther('250'))).wait()
        await wait(3000)

        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        const inspectRandomNodeHelper = new InspectRandomNodeHelper(flagger.operatorConfig)
        await inspectRandomNodeHelper.flag(toEthereumAddress(sponsorship.address), toEthereumAddress(target.operatorContract.address))

        waitForCondition(async (): Promise<boolean> => {
            const result = await graphClient.queryEntity<{ operator: { flagsOpened: any[] } }>({ query: `
                {
                    operator(id: "${flagger.operatorContract.address.toLowerCase()}") {
                        id
                        flagsOpened {
                            id
                        }
                    }
                }
                `
            })
            return result.operator.flagsOpened.length === 1
        }, 10000, 1000)

        waitForCondition(async (): Promise<boolean> => {
            const result = await graphClient.queryEntity<{ operator: { flagsTargeted: any[] } }>({ query: `
                {
                    operator(id: "${target.operatorContract.address.toLowerCase()}") {
                        id
                        flagsTargeted {
                            id
                        }
                    }
                }
                `
            })
            return result.operator.flagsTargeted.length === 1
        }, 10000, 1000)
    })
})
