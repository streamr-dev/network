import { config as CHAIN_CONFIG } from '@streamr/config'
import { OperatorFactory, operatorFactoryABI, type Sponsorship } from '@streamr/network-contracts-ethers6'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { toEthereumAddress, waitForCondition } from '@streamr/utils'
import { Contract, Wallet } from 'ethers'
import { CONFIG_TEST } from '../../src/ConfigTest'
import { StreamrClient } from '../../src/StreamrClient'
import { OperatorContractFacade } from '../../src/contracts/OperatorContractFacade'
import {
    SetupOperatorContractReturnType,
    createTheGraphClient,
    delegate,
    deploySponsorshipContract,
    getAdminWallet,
    setupOperatorContract,
    sponsor,
    stake
} from '../../src/contracts/operatorContractUtils'

const createClient = (privateKey?: string): StreamrClient => {
    return new StreamrClient({
        ...CONFIG_TEST,
        auth: (privateKey !== undefined) ? {
            privateKey
        } : undefined
    })
}

async function createStream(): Promise<string> {
    const client = createClient(await fetchPrivateKeyWithGas())
    const streamId = (await client.createStream(`/${Date.now()}`)).id
    await client.destroy()
    return streamId
}

const getOperatorContractFacade = async (wallet: Wallet | undefined, operator: SetupOperatorContractReturnType): Promise<OperatorContractFacade> => {
    const client = createClient(wallet?.privateKey)
    const contractAddress = toEthereumAddress(await operator.operatorContract.getAddress())
    return client.getOperatorContractFacade(contractAddress)
}

describe('OperatorContractFacade', () => {
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
        const contractFacade = await getOperatorContractFacade(deployedOperator.nodeWallets[0], deployedOperator)
        const randomOperatorAddress = await contractFacade.getRandomOperator()
        expect(randomOperatorAddress).toBeDefined()
        expect(randomOperatorAddress).not.toEqual(await deployedOperator.operatorContract.getAddress()) // should not be me

        // check it's a valid operator, deployed by the OperatorFactory
        const operatorFactory = new Contract(
            CHAIN_CONFIG.dev2.contracts.OperatorFactory,
            operatorFactoryABI,
            getAdminWallet()
        ) as unknown as OperatorFactory
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)) > 0
        expect(isDeployedByFactory).toBeTrue()

    }, 30 * 1000)

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const operatorContractAddress = toEthereumAddress(await deployedOperator.operatorContract.getAddress())
        await delegate(deployedOperator.operatorWallet, operatorContractAddress, 20000)
        await stake(deployedOperator.operatorContract, await sponsorship1.getAddress(), 10000)
        await stake(deployedOperator.operatorContract, await sponsorship2.getAddress(), 10000)

        const contractFacade = await getOperatorContractFacade(undefined, deployedOperator)

        await waitForCondition(async (): Promise<boolean> => {
            const res = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContractAddress))
            return res.length === 2
        }, 10000, 500)

        const sponsorships = await contractFacade.getSponsorshipsOfOperator(toEthereumAddress(operatorContractAddress))
        expect(sponsorships).toIncludeSameMembers([
            {
                sponsorshipAddress: toEthereumAddress(await sponsorship1.getAddress()),
                operatorCount: 1,
                streamId: streamId1
            },
            {
                sponsorshipAddress: toEthereumAddress(await sponsorship2.getAddress()),
                operatorCount: 1,
                streamId: streamId2
            }
        ])

        const operators = await contractFacade.getOperatorsInSponsorship(toEthereumAddress(await sponsorship1.getAddress()))
        expect(operators).toEqual([toEthereumAddress(await deployedOperator.operatorContract.getAddress())])
    }, 30 * 1000)

    it('flag', async () => {
        const flagger = deployedOperator
        const target = await setupOperatorContract()

        await sponsor(flagger.operatorWallet, await sponsorship2.getAddress(), 50000)

        await delegate(flagger.operatorWallet, await flagger.operatorContract.getAddress(), 20000)
        await delegate(target.operatorWallet, await target.operatorContract.getAddress(), 30000)
        await stake(flagger.operatorContract, await sponsorship2.getAddress(), 15000)
        await stake(target.operatorContract, await sponsorship2.getAddress(), 25000)

        const contractFacade = await getOperatorContractFacade(deployedOperator.nodeWallets[0], flagger)
        await contractFacade.flag(
            toEthereumAddress(await sponsorship2.getAddress()),
            toEthereumAddress(await target.operatorContract.getAddress()),
            2
        )

        const graphClient = createTheGraphClient()
        await waitForCondition(async (): Promise<boolean> => {
            const result = await graphClient.queryEntity<{ operator: { flagsOpened: any[] } }>({ query: `
                {
                    operator(id: "${(await flagger.operatorContract.getAddress()).toLowerCase()}") {
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
                    operator(id: "${(await target.operatorContract.getAddress()).toLowerCase()}") {
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
    }, 60 * 1000)  // TODO why this is slower, takes ~35 seconds?
})
