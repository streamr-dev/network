import { Contract } from '@ethersproject/contracts'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { OperatorFactory, operatorFactoryABI } from '@streamr/network-contracts'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'
import {
    createTheGraphClient,
    delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens, getAdminWallet, setupOperatorContract, sponsor,
    stake
} from './contractUtils'
import { createClient, createTestStream } from '../../../utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'

describe('ContractFacade', () => {

    it('getRandomOperator', async () => {
        const deployConfig = {
            operatorConfig: {
                operatorsCutPercent: 10
            }
        }
        const { operatorContract, operatorServiceConfig, nodeWallets } = await setupOperatorContract({ nodeCount: 1, ...deployConfig })
        // deploy another operator to make sure there are at least 2 operators
        await setupOperatorContract(deployConfig)

        const contractFacade = ContractFacade.createInstance({
            ...operatorServiceConfig,
            signer: nodeWallets[0],
            minSponsorshipEarningsInWithdraw: 1,
            maxSponsorshipsInWithdraw: 20
        })
        const randomOperatorAddress = await contractFacade.getRandomOperator()
        expect(randomOperatorAddress).toBeDefined()

        // check it's a valid operator, deployed by the OperatorFactory
        const operatorFactory = new Contract(
            CHAIN_CONFIG.dev2.contracts.OperatorFactory,
            operatorFactoryABI, getAdminWallet()
        ) as unknown as OperatorFactory
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)).gt(0)
        expect(isDeployedByFactory).toBeTrue()
        // check it's not my operator
        expect(randomOperatorAddress).not.toEqual(operatorContract.address)
    }, 60 * 1000)

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const { operatorWallet, operatorContract, operatorServiceConfig } = await setupOperatorContract()
        const contractFacade = ContractFacade.createInstance({
            ...operatorServiceConfig,
            signer: undefined as any,
            minSponsorshipEarningsInWithdraw: 1,
            maxSponsorshipsInWithdraw: 20
        })

        const client = createClient(await fetchPrivateKeyWithGas())
        const streamId1 = (await createTestStream(client, module)).id
        const streamId2 = (await createTestStream(client, module)).id
        await client.destroy()
        const sponsorship1 = await deploySponsorshipContract({ streamId: streamId1, deployer: operatorWallet })
        const sponsorship2 = await deploySponsorshipContract({ streamId: streamId2, deployer: operatorWallet })

        await delegate(operatorWallet, operatorContract.address, 200)
        await stake(operatorContract, sponsorship1.address, 100)
        await stake(operatorContract, sponsorship2.address, 100)

        await waitForCondition(async (): Promise<boolean> => {
            const res = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address))
            return res.length === 2
        }, 10000, 500)

        const sponsorships = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address))
        expect(sponsorships).toIncludeSameMembers([
            {
                sponsorshipAddress: toEthereumAddress(sponsorship1.address),
                operatorCount: 1,
                streamId: streamId1
            },
            {
                sponsorshipAddress: toEthereumAddress(sponsorship2.address),
                operatorCount: 1,
                streamId: streamId2
            }
        ])

        const operators = await contractFacade.getOperatorsInSponsorship(toEthereumAddress(sponsorship1.address))
        expect(operators).toEqual([toEthereumAddress(operatorContract.address)])
    }, 90 * 1000)

    it('flag', async () => {
        const flagger = await setupOperatorContract({ nodeCount: 1 })
        const target = await setupOperatorContract()

        const client = createClient(await fetchPrivateKeyWithGas())
        const streamId1 = (await createTestStream(client, module)).id
        await client.destroy()
        const sponsorship = await deploySponsorshipContract({ streamId: streamId1, deployer: await generateWalletWithGasAndTokens() })
        await sponsor(flagger.operatorWallet, sponsorship.address, 500)

        await delegate(flagger.operatorWallet, flagger.operatorContract.address, 200)
        await delegate(target.operatorWallet, target.operatorContract.address, 300)
        await stake(flagger.operatorContract, sponsorship.address, 150)
        await stake(target.operatorContract, sponsorship.address, 250)

        const contractFacade = ContractFacade.createInstance({
            ...flagger.operatorServiceConfig,
            signer: flagger.nodeWallets[0],
            minSponsorshipEarningsInWithdraw: 1,
            maxSponsorshipsInWithdraw: 20
        })
        await contractFacade.flag(toEthereumAddress(sponsorship.address), toEthereumAddress(target.operatorContract.address), 2)

        const graphClient = createTheGraphClient()
        await waitForCondition(async (): Promise<boolean> => {
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

        await waitForCondition(async (): Promise<boolean> => {
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
    }, 90 * 1000)
})
