import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, TheGraphClient, toEthereumAddress, waitForCondition } from '@streamr/utils'
import fetch from 'node-fetch'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { createClient, createTestStream } from '../../../utils'
import {
    TEST_CHAIN_CONFIG,
    delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    setupOperatorContract,
    sponsor,
    stake
} from './contractUtils'

jest.setTimeout(600 * 1000)

describe('InspectRandomNodeHelper', () => {

    let streamId1: string
    let streamId2: string
    let graphClient: TheGraphClient

    beforeAll(async () => {
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()

        graphClient = new TheGraphClient({
            serverUrl: TEST_CHAIN_CONFIG.theGraphUrl,
            fetch,
            logger: new Logger(module)
        })
    })

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const { operatorWallet, operatorContract, operatorServiceConfig } = await setupOperatorContract()
        const inspectRandomNodeHelper = new InspectRandomNodeHelper({
            ...operatorServiceConfig,
            signer: undefined as any
        })

        const sponsorship1 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })
        const sponsorship2 = await deploySponsorshipContract({ streamId: streamId2, deployer: operatorWallet })

        await delegate(operatorWallet, operatorContract.address, 200)
        await stake(operatorContract, sponsorship1.address, 100)
        await stake(operatorContract, sponsorship2.address, 100)

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
        const flagger = await setupOperatorContract({ nodeCount: 1 })
        const target = await setupOperatorContract()

        const sponsorship = await deploySponsorshipContract({ streamId: streamId1, deployer: await generateWalletWithGasAndTokens() })
        await sponsor(flagger.operatorWallet, sponsorship.address, 500)

        await delegate(flagger.operatorWallet, flagger.operatorContract.address, 200)
        await delegate(target.operatorWallet, target.operatorContract.address, 300)
        await stake(flagger.operatorContract, sponsorship.address, 150)
        await stake(target.operatorContract, sponsorship.address, 250)

        const inspectRandomNodeHelper = new InspectRandomNodeHelper({
            ...flagger.operatorServiceConfig,
            signer: flagger.nodeWallets[0]
        })
        await inspectRandomNodeHelper.flagWithMetadata(toEthereumAddress(sponsorship.address), toEthereumAddress(target.operatorContract.address), 2)

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
