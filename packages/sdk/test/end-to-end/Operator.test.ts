import { config as CHAIN_CONFIG } from '@streamr/config'
import {
    OperatorABI,
    Operator as OperatorContract,
    OperatorFactoryABI,
    OperatorFactory as OperatorFactoryContract,
    Sponsorship as SponsorshipContract
} from '@streamr/network-contracts'
import { createTestPrivateKey, getTestAdminWallet, setupTestOperatorContract, setupTestOperatorContractReturnType } from '@streamr/test-utils'
import { Logger, TheGraphClient, toEthereumAddress, until } from '@streamr/utils'
import { Contract, parseEther, Wallet } from 'ethers'
import sample from 'lodash/sample'
import { StreamrClient } from '../../src/StreamrClient'
import { Operator } from '../../src/contracts/Operator'
import {
    delegate,
    sponsor,
    stake
} from '../../src/contracts/operatorContractUtils'
import { deployTestOperatorContract, deployTestSponsorshipContract } from '../test-utils/utils'

const EARNINGS_PER_SECOND = parseEther('1')

const createClient = (privateKey?: string): StreamrClient => {
    return new StreamrClient({
        environment: 'dev2',
        auth: (privateKey !== undefined) ? {
            privateKey
        } : undefined
    })
}

const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: CHAIN_CONFIG.dev2.theGraphUrl,
        fetch: (...params: Parameters<typeof fetch>) => fetch(...params),
        logger: new Logger('Operator.test')
    })
}

async function createStream(): Promise<string> {
    const client = createClient(await createTestPrivateKey({ gas: true }))
    const streamId = (await client.createStream(`/${Date.now()}`)).id
    await client.destroy()
    return streamId
}

const getOperator = async (wallet: Wallet | undefined, operator: setupTestOperatorContractReturnType): Promise<Operator> => {
    const client = createClient(wallet?.privateKey)
    return client.getOperator(operator.operatorContractAddress)
}

describe('Operator', () => {
    let streamId1: string
    let streamId2: string
    let sponsorship1: SponsorshipContract
    let sponsorship2: SponsorshipContract
    let deployedOperator: setupTestOperatorContractReturnType

    beforeAll(async () => {
        const concurrentTasks = await Promise.all([
            createStream(),
            createStream(),
            setupTestOperatorContract({ nodeCount: 1, deployTestOperatorContract })
        ])
        streamId1 = concurrentTasks[0]
        streamId2 = concurrentTasks[1]
        deployedOperator = concurrentTasks[2]

        sponsorship1 = await deployTestSponsorshipContract({
            streamId: streamId1,
            deployer: deployedOperator.operatorWallet,
            earningsPerSecond: EARNINGS_PER_SECOND
        })
        sponsorship2 = await deployTestSponsorshipContract({
            streamId: streamId2,
            deployer: deployedOperator.operatorWallet,
            earningsPerSecond: EARNINGS_PER_SECOND
        })

    }, 90 * 1000)

    it('getStakedOperators', async () => {
        await delegate(deployedOperator.operatorWallet, deployedOperator.operatorContractAddress, parseEther('20000'))
        await stake(deployedOperator.operatorWallet, deployedOperator.operatorContractAddress, await sponsorship1.getAddress(), parseEther('10000'))
        const dummyOperator = await getOperator(deployedOperator.nodeWallets[0], deployedOperator)
        const randomOperatorAddress = sample(await dummyOperator.getStakedOperators())
        expect(randomOperatorAddress).toBeDefined()

        // check it's a valid operator, deployed by the OperatorFactory
        const operatorFactory = new Contract(
            CHAIN_CONFIG.dev2.contracts.OperatorFactory,
            OperatorFactoryABI,
            getTestAdminWallet()
        ) as unknown as OperatorFactoryContract
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)) > 0
        expect(isDeployedByFactory).toBeTrue()
        // check that there is a stake
        const operatorContract = new Contract(
            randomOperatorAddress!,
            OperatorABI,
            deployedOperator.operatorWallet
        ) as unknown as OperatorContract
        expect(await operatorContract.totalStakedIntoSponsorshipsWei()).toBeGreaterThan(0n)
    }, 30 * 1000)

    it('getSponsorships, getOperatorsInSponsorship', async () => {
        await delegate(deployedOperator.operatorWallet, deployedOperator.operatorContractAddress, parseEther('20000'))
        await stake(deployedOperator.operatorWallet, deployedOperator.operatorContractAddress, await sponsorship1.getAddress(), parseEther('10000'))
        await stake(deployedOperator.operatorWallet, deployedOperator.operatorContractAddress, await sponsorship2.getAddress(), parseEther('10000'))

        const operator = await getOperator(undefined, deployedOperator)

        await until(async (): Promise<boolean> => {
            const res = await operator.getSponsorships()
            return res.length === 2
        }, 10000, 500)

        const sponsorships = await operator.getSponsorships()
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

        const operators = await operator.getOperatorsInSponsorship(toEthereumAddress(await sponsorship1.getAddress()))
        expect(operators).toEqual([deployedOperator.operatorContractAddress])
    }, 30 * 1000)

    it('flag', async () => {
        const flagger = deployedOperator
        const target = await setupTestOperatorContract({
            deployTestOperatorContract
        })

        await sponsor(flagger.operatorWallet, await sponsorship2.getAddress(), parseEther('50000'))

        await delegate(flagger.operatorWallet, flagger.operatorContractAddress, parseEther('20000'))
        await delegate(target.operatorWallet, target.operatorContractAddress, parseEther('30000'))
        await stake(flagger.operatorWallet, flagger.operatorContractAddress, await sponsorship2.getAddress(), parseEther('15000'))
        await stake(target.operatorWallet, target.operatorContractAddress, await sponsorship2.getAddress(), parseEther('25000'))

        const contractFacade = await getOperator(deployedOperator.nodeWallets[0], flagger)
        await contractFacade.flag(
            toEthereumAddress(await sponsorship2.getAddress()),
            toEthereumAddress(target.operatorContractAddress),
            2
        )

        const graphClient = createTheGraphClient()
        await until(async (): Promise<boolean> => {
            const result = await graphClient.queryEntity<{ operator: { flagsOpened: any[] } }>({ query: `
                {
                    operator(id: "${(flagger.operatorContractAddress).toLowerCase()}") {
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

        await until(async (): Promise<boolean> => {
            const result = await graphClient.queryEntity<{ operator: { flagsTargeted: any[] } }>({ query: `
                {
                    operator(id: "${target.operatorContractAddress.toLowerCase()}") {
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

    it('avoids sending a transaction when trying to close non-existing flags', async () => {
        const wallet = deployedOperator.nodeWallets[0] as Wallet
        const operator = await getOperator(wallet, deployedOperator)
        const nonceBefore = await wallet.getNonce() // nonce = "how many transactions sent so far"
        await expect(async () => operator.closeFlag(
            toEthereumAddress(await sponsorship1.getAddress()),
            toEthereumAddress(deployedOperator.operatorContractAddress)
        )).rejects.toThrow('action="estimateGas"')
        const nonceAfter = await wallet.getNonce()
        expect(nonceAfter).toEqual(nonceBefore)
    })

    describe('fetchRedundancyFactor', () => {

        let operator: Operator

        async function updateMetadata(metadata: string): Promise<void> {
            const operator = new Contract(
                deployedOperator.operatorContractAddress,
                OperatorABI,
                deployedOperator.operatorWallet
            ) as unknown as OperatorContract
            await (await operator.updateMetadata(metadata)).wait()
        }

        beforeAll(async () => (
            operator = createClient(deployedOperator.operatorWallet.privateKey).getOperator(deployedOperator.operatorContractAddress)
        ))

        describe('happy paths', () => {
            it('empty metadata', async () => {
                await updateMetadata('')
                const factor = await operator.fetchRedundancyFactor()
                expect(factor).toEqual(1)
            })

            it('explicit valid metadata', async () => {
                await updateMetadata(JSON.stringify({ redundancyFactor: 6 }))
                const factor = await operator.fetchRedundancyFactor()
                expect(factor).toEqual(6)
            })
        })

        describe('no result cases', () => {
            it('invalid json', async () => {
                await updateMetadata('invalidjson')
                const factor = await operator.fetchRedundancyFactor()
                expect(factor).toBeUndefined()
            })

            it('valid json but missing field', async () => {
                await updateMetadata(JSON.stringify({ foo: 'bar' }))
                const factor = await operator.fetchRedundancyFactor()
                expect(factor).toBeUndefined()
            })

            it('valid json but invalid value', async () => {
                await updateMetadata(JSON.stringify({ redundancyFactor: 0 }))
                const factor = await operator.fetchRedundancyFactor()
                expect(factor).toBeUndefined()
            })
        })
    })
})
