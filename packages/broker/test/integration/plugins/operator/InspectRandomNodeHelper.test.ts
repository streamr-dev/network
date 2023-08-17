import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import { config } from '@streamr/config'
import type { TestToken } from '@streamr/network-contracts'
import { tokenABI } from '@streamr/network-contracts'
import { Logger, TheGraphClient, toEthereumAddress, wait, waitForCondition } from '@streamr/utils'
import fetch from 'node-fetch'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { createClient } from '../../../utils'
import { deploySponsorship } from './deploySponsorshipContract'
import { setupOperatorContract } from './setupOperatorContract'

const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)
const chainConfig = config.dev2
const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'

jest.setTimeout(600 * 1000)

describe('InspectRandomNodeHelper', () => {
    const chainURL = chainConfig.rpcEndpoints[0]

    let provider: Provider
    let token: TestToken
    let adminWallet: Wallet
    let streamId1: string
    let streamId2: string
    let graphClient: TheGraphClient

    beforeAll(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug('Connected to: ', await provider.getNetwork())

        adminWallet = new Wallet(STREAM_CREATION_KEY, provider)

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken

        const client = createClient(STREAM_CREATION_KEY)
        streamId1 = (await client.createStream(`/operatorvalueservicetest-1-${Date.now()}`)).id
        streamId2 = (await client.createStream(`/operatorvalueservicetest-2-${Date.now()}`)).id
        await client.destroy()

        graphClient = new TheGraphClient({
            serverUrl: theGraphUrl,
            fetch,
            logger: logger
        })
    })

    it('getSponsorshipsOfOperator, getOperatorsInSponsorship', async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract(
            { chainConfig, provider, theGraphUrl },
        )
        logger.debug('Deployed OperatorContract at: ' + operatorContract.address)
        const inspectRandomNodeHelper = new InspectRandomNodeHelper(operatorConfig)
            
        logger.debug('Added OperatorClient listeners, deploying Sponsorship contract...')
        const sponsorship = await deploySponsorship(chainConfig, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(chainConfig, operatorWallet, {
            streamId: streamId2
        })

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
        const flagger = await setupOperatorContract({ chainConfig, provider, theGraphUrl })
        logger.trace('deployed flagger contract ' + flagger.operatorConfig.operatorContractAddress)
        const target = await setupOperatorContract({ chainConfig, provider, theGraphUrl })
        logger.trace('deployed target contract ' + target.operatorConfig.operatorContractAddress)

        logger.trace('deploying sponsorship contract')
        const sponsorship = await deploySponsorship(chainConfig, adminWallet, {
            streamId: streamId1 })
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
