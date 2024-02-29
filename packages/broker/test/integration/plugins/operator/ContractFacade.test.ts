import { Contract } from '@ethersproject/contracts'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { OperatorFactory, operatorFactoryABI, type Sponsorship } from '@streamr/network-contracts'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'
import {
    createTheGraphClient,
    delegate,
    deploySponsorshipContract,
    getAdminWallet,
    setupOperatorContract,
    SetupOperatorContractReturnType,
    sponsor,
    stake
} from './contractUtils'
import { createClient, createTestStream } from '../../../utils'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'

async function createStream(): Promise<string> {
    const client = createClient(await fetchPrivateKeyWithGas())
    const streamId = (await createTestStream(client, module)).id
    await client.destroy()
    return streamId
}

describe('ContractFacade', () => {
    let streamId1: string
    let streamId2: string
    let sponsorship1: Sponsorship
    let sponsorship2: Sponsorship
    let deployedOperator: SetupOperatorContractReturnType

    beforeAll(async () => {
        const concurrentTasks = await Promise.all([
            createStream(),
            createStream(),
            setupOperatorContract({ nodeCount: 1 })
        ])
        streamId1 = concurrentTasks[0]
        streamId2 = concurrentTasks[1]
        deployedOperator = concurrentTasks[2]

        sponsorship1 = await deploySponsorshipContract({
            streamId: streamId1,
            deployer: deployedOperator.operatorWallet
        })
        sponsorship2 = await deploySponsorshipContract({
            streamId: streamId2,
            deployer: deployedOperator.operatorWallet
        })

    }, 90 * 1000)

    it('getRandomOperator', async () => {
        const contractFacade = ContractFacade.createInstance({
            ...deployedOperator.operatorServiceConfig,
            signer: deployedOperator.nodeWallets[0]
        })
        const randomOperatorAddress = await contractFacade.getRandomOperator()
        expect(randomOperatorAddress).toBeDefined()
        expect(randomOperatorAddress).not.toEqual(deployedOperator.operatorContract.address) // should not be me

        // check it's a valid operator, deployed by the OperatorFactory
        const operatorFactory = new Contract(
            CHAIN_CONFIG.dev2.contracts.OperatorFactory,
            operatorFactoryABI,
            getAdminWallet()
        ) as unknown as OperatorFactory
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)).gt(0)
        expect(isDeployedByFactory).toBeTrue()

    }, 30 * 1000)

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const operatorContractAddress = toEthereumAddress(deployedOperator.operatorContract.address)
        await delegate(deployedOperator.operatorWallet, operatorContractAddress, 20000)
        await stake(deployedOperator.operatorContract, sponsorship1.address, 10000)
        await stake(deployedOperator.operatorContract, sponsorship2.address, 10000)

        const contractFacade = ContractFacade.createInstance({
            ...deployedOperator.operatorServiceConfig,
            signer: undefined as any
        })

        await waitForCondition(async (): Promise<boolean> => {
            const res = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContractAddress))
            return res.length === 2
        }, 10000, 500)

        const sponsorships = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContractAddress))
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
        expect(operators).toEqual([toEthereumAddress(deployedOperator.operatorContract.address)])
    }, 30 * 1000)

    it('flag', async () => {
        const flagger = deployedOperator
        const target = await setupOperatorContract()

        await sponsor(flagger.operatorWallet, sponsorship2.address, 50000)

        await delegate(flagger.operatorWallet, flagger.operatorContract.address, 20000)
        await delegate(target.operatorWallet, target.operatorContract.address, 30000)
        await stake(flagger.operatorContract, sponsorship2.address, 15000)
        await stake(target.operatorContract, sponsorship2.address, 25000)

        const contractFacade = ContractFacade.createInstance({
            ...flagger.operatorServiceConfig,
            signer: flagger.nodeWallets[0]
        })
        await contractFacade.flag(toEthereumAddress(sponsorship2.address), toEthereumAddress(target.operatorContract.address), 2)

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
    }, 30 * 1000)
})
