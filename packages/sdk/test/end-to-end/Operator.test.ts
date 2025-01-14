import { config as CHAIN_CONFIG } from '@streamr/config'
import { fetchPrivateKeyWithGas, generateWalletWithGasAndTokens } from '@streamr/test-utils'
import { Logger, TheGraphClient, toEthereumAddress, until } from '@streamr/utils'
import { Contract, parseEther, Wallet } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'
import { Operator } from '../../src/contracts/Operator'
import {
    SetupOperatorContractReturnType,
    delegate,
    deploySponsorshipContract,
    getTestAdminWallet,
    setupOperatorContract,
    sponsor,
    stake
} from '../../src/contracts/operatorContractUtils'
import type { Operator as OperatorContract } from '../../src/ethereumArtifacts/Operator'
import OperatorArtifact from '../../src/ethereumArtifacts/OperatorAbi.json'
import type { OperatorFactory as OperatorFactoryContract } from '../../src/ethereumArtifacts/OperatorFactory'
import OperatorFactoryArtifact from '../../src/ethereumArtifacts/OperatorFactoryAbi.json'
import type { Sponsorship as SponsorshipContract } from '../../src/ethereumArtifacts/Sponsorship'
import { sample } from 'lodash'

const createClient = (privateKey?: string): StreamrClient => {
    return new StreamrClient({
        environment: 'dev2',
        auth:
            privateKey !== undefined
                ? {
                      privateKey
                  }
                : undefined
    })
}

const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: CHAIN_CONFIG.dev2.theGraphUrl,
        fetch: (...params: Parameters<typeof fetch>) => fetch(...params),
        logger: new Logger(module)
    })
}

async function createStream(): Promise<string> {
    const client = createClient(await fetchPrivateKeyWithGas())
    const streamId = (await client.createStream(`/${Date.now()}`)).id
    await client.destroy()
    return streamId
}

const getOperator = async (
    wallet: Wallet | undefined,
    operator: SetupOperatorContractReturnType
): Promise<Operator> => {
    const client = createClient(wallet?.privateKey)
    const contractAddress = toEthereumAddress(await operator.operatorContract.getAddress())
    return client.getOperator(contractAddress)
}

describe('Operator', () => {
    let streamId1: string
    let streamId2: string
    let sponsorship1: SponsorshipContract
    let sponsorship2: SponsorshipContract
    let deployedOperator: SetupOperatorContractReturnType

    beforeAll(async () => {
        const concurrentTasks = await Promise.all([
            createStream(),
            createStream(),
            setupOperatorContract({ nodeCount: 1, generateWalletWithGasAndTokens })
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

    it(
        'getStakedOperators',
        async () => {
            await delegate(
                deployedOperator.operatorWallet,
                await deployedOperator.operatorContract.getAddress(),
                parseEther('20000')
            )
            await stake(deployedOperator.operatorContract, await sponsorship1.getAddress(), parseEther('10000'))
            const dummyOperator = await getOperator(deployedOperator.nodeWallets[0], deployedOperator)
            const randomOperatorAddress = sample(await dummyOperator.getStakedOperators())
            expect(randomOperatorAddress).toBeDefined()

            // check it's a valid operator, deployed by the OperatorFactory
            const operatorFactory = new Contract(
                CHAIN_CONFIG.dev2.contracts.OperatorFactory,
                OperatorFactoryArtifact,
                getTestAdminWallet()
            ) as unknown as OperatorFactoryContract
            const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)) > 0
            expect(isDeployedByFactory).toBeTrue()
            // check that there is a stake
            const operatorContract = new Contract(
                randomOperatorAddress!,
                OperatorArtifact,
                deployedOperator.operatorWallet
            ) as unknown as OperatorContract
            expect(await operatorContract.totalStakedIntoSponsorshipsWei()).toBeGreaterThan(0n)
        },
        30 * 1000
    )

    it(
        'getSponsorships, getOperatorsInSponsorship',
        async () => {
            const operatorContractAddress = toEthereumAddress(await deployedOperator.operatorContract.getAddress())
            await delegate(deployedOperator.operatorWallet, operatorContractAddress, parseEther('20000'))
            await stake(deployedOperator.operatorContract, await sponsorship1.getAddress(), parseEther('10000'))
            await stake(deployedOperator.operatorContract, await sponsorship2.getAddress(), parseEther('10000'))

            const operator = await getOperator(undefined, deployedOperator)

            await until(
                async (): Promise<boolean> => {
                    const res = await operator.getSponsorships()
                    return res.length === 2
                },
                10000,
                500
            )

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

            const operators = await operator.getOperatorsInSponsorship(
                toEthereumAddress(await sponsorship1.getAddress())
            )
            expect(operators).toEqual([toEthereumAddress(await deployedOperator.operatorContract.getAddress())])
        },
        30 * 1000
    )

    it(
        'flag',
        async () => {
            const flagger = deployedOperator
            const target = await setupOperatorContract({
                generateWalletWithGasAndTokens
            })

            await sponsor(flagger.operatorWallet, await sponsorship2.getAddress(), parseEther('50000'))

            await delegate(flagger.operatorWallet, await flagger.operatorContract.getAddress(), parseEther('20000'))
            await delegate(target.operatorWallet, await target.operatorContract.getAddress(), parseEther('30000'))
            await stake(flagger.operatorContract, await sponsorship2.getAddress(), parseEther('15000'))
            await stake(target.operatorContract, await sponsorship2.getAddress(), parseEther('25000'))

            const contractFacade = await getOperator(deployedOperator.nodeWallets[0], flagger)
            await contractFacade.flag(
                toEthereumAddress(await sponsorship2.getAddress()),
                toEthereumAddress(await target.operatorContract.getAddress()),
                2
            )

            const graphClient = createTheGraphClient()
            await until(
                async (): Promise<boolean> => {
                    const result = await graphClient.queryEntity<{ operator: { flagsOpened: any[] } }>({
                        query: `
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
                },
                10000,
                1000
            )

            await until(
                async (): Promise<boolean> => {
                    const result = await graphClient.queryEntity<{ operator: { flagsTargeted: any[] } }>({
                        query: `
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
                },
                10000,
                1000
            )
        },
        60 * 1000
    ) // TODO why this is slower, takes ~35 seconds?

    it('avoids sending a transaction when trying to close non-existing flags', async () => {
        const wallet = deployedOperator.nodeWallets[0] as Wallet
        const operator = await getOperator(wallet, deployedOperator)
        const nonceBefore = await wallet.getNonce() // nonce = "how many transactions sent so far"
        await expect(async () =>
            operator.closeFlag(
                toEthereumAddress(await sponsorship1.getAddress()),
                toEthereumAddress(await deployedOperator.operatorContract.getAddress())
            )
        ).rejects.toThrow('action="estimateGas"')
        const nonceAfter = await wallet.getNonce()
        expect(nonceAfter).toEqual(nonceBefore)
    })

    describe('fetchRedundancyFactor', () => {
        let operator: Operator

        async function updateMetadata(metadata: string): Promise<void> {
            const operator = new Contract(
                await deployedOperator.operatorContract.getAddress(),
                OperatorArtifact,
                deployedOperator.operatorWallet
            ) as unknown as OperatorContract
            await (await operator.updateMetadata(metadata)).wait()
        }

        beforeAll(
            async () =>
                (operator = createClient(deployedOperator.operatorWallet.privateKey).getOperator(
                    toEthereumAddress(await deployedOperator.operatorContract.getAddress())
                ))
        )

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
