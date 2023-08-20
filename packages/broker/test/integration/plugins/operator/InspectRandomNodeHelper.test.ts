import { Provider } from '@ethersproject/providers'
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
    getProvider,
    getTokenContract,
    setupOperatorContract
} from './contractUtils'

const logger = new Logger(module)

jest.setTimeout(600 * 1000)

describe('InspectRandomNodeHelper', () => {
    let provider: Provider
    let token: TestToken
    let streamId1: string
    let streamId2: string
    let graphClient: TheGraphClient

    beforeAll(async () => {
        provider = getProvider()
        logger.debug('Connected to: ', await provider.getNetwork())

        token = getTokenContract()

        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()

        graphClient = new TheGraphClient({
            serverUrl: THE_GRAPH_URL,
            fetch,
            logger: logger
        })
    })

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract({ provider })
        logger.debug('Deployed OperatorContract at: ' + operatorContract.address)
        const inspectRandomNodeHelper = new InspectRandomNodeHelper(operatorConfig)

        logger.debug('Added OperatorClient listeners, deploying Sponsorship contract...')
        const sponsorship = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId1 })
        const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId: streamId2 })

        logger.debug(`Sponsorship1 deployed at ${sponsorship.address}`)
        logger.debug(`Sponsorship2 deployed at ${sponsorship2.address}`)
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

        logger.debug('Staking to sponsorship...')
        await (await operatorContract.stake(sponsorship.address, parseEther('100'))).wait()
        logger.debug(`staked on sponsorship ${sponsorship.address}`)
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()
        logger.debug(`staked on sponsorship ${sponsorship2.address}`)

        await waitForCondition(async (): Promise<boolean> => {
            const res = await inspectRandomNodeHelper.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address), 0)
            return res.length === 2
        }, 10000, 1000)

        const sponsorships = await inspectRandomNodeHelper.getSponsorshipsOfOperator(toEthereumAddress(operatorContract.address), 0)
        expect(sponsorships).toEqual(expect.arrayContaining([toEthereumAddress(sponsorship.address), toEthereumAddress(sponsorship2.address)]))

        const operators = await inspectRandomNodeHelper.getOperatorsInSponsorship(toEthereumAddress(sponsorship.address), 0)
        expect(operators).toEqual([toEthereumAddress(operatorContract.address)])
    })

    it('works to flag through the inspectRandomNodeHelper', async () => {
        const flagger = await setupOperatorContract({ provider })
        logger.trace('deployed flagger contract ' + flagger.operatorConfig.operatorContractAddress)
        const target = await setupOperatorContract({ provider })
        logger.trace('deployed target contract ' + target.operatorConfig.operatorContractAddress)

        logger.trace('deploying sponsorship contract')
        const sponsorship = await deploySponsorshipContract({
            deployer: await generateWalletWithGasAndTokens(provider),
            streamId: streamId1
        })
        logger.trace('sponsoring sponsorship contract')
        await (await token.connect(flagger.operatorWallet).approve(sponsorship.address, parseEther('500'))).wait()
        await (await sponsorship.connect(flagger.operatorWallet).sponsor(parseEther('500'))).wait()

        logger.trace('each operator delegates to its operactor contract')
        logger.trace('delegating from flagger: ' + flagger.operatorWallet.address)
        await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
            parseEther('200'), flagger.operatorWallet.address)).wait()
        logger.trace('delegating from target: ' + target.operatorWallet.address)
        await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
            parseEther('300'), target.operatorWallet.address)).wait()

        await wait(3000) // sometimes these stake fail, possibly when they end up in the same block
        logger.trace('staking to sponsorship contract from flagger and target and voter')
        logger.trace('staking from flagger: ' + flagger.operatorContract.address)
        await (await flagger.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()
        await wait(3000)
        logger.trace('staking from target: ' + target.operatorContract.address)
        await (await target.operatorContract.stake(sponsorship.address, parseEther('250'))).wait()
        await wait(3000)

        logger.trace('registering node addresses')
        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        logger.trace('flagging target operator')
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
