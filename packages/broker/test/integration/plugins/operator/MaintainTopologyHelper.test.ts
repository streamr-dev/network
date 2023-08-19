import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import { config as CHAIN_CONFIG } from '@streamr/config'
import type { Operator, TestToken } from '@streamr/network-contracts'
import { tokenABI } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, wait, waitForCondition } from '@streamr/utils'
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { createClient, createTestStream } from '../../../utils'
import { deploySponsorship } from './deploySponsorshipContract'
import { setupOperatorContract } from './setupOperatorContract'

const chainConfig = CHAIN_CONFIG.dev2

const logger = new Logger(module)

jest.setTimeout(60 * 1000)

describe('MaintainTopologyHelper', () => {
    const chainURL = chainConfig.rpcEndpoints[0].url

    let provider: Provider
    let token: TestToken
    let streamId1: string
    let streamId2: string

    beforeAll(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug('Connected to: ', await provider.getNetwork())

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()
    })

    describe('normal workflow', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract({
                provider,
                chainConfig,
            }))
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('client emits events when sponsorships are staked', async () => {
            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                eventcount += 1
            })
            topologyHelper.on('removeStakedStream', (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await topologyHelper.start()

            logger.debug('Added OperatorClient listeners, deploying Sponsorship contract...')
            sponsorship1 = await deploySponsorship({ chainConfig, deployer: operatorWallet, streamId: streamId1 })
            sponsorship2 = await deploySponsorship({ chainConfig, deployer: operatorWallet, streamId: streamId2 })

            logger.debug(`Sponsorship deployed at ${sponsorship1.address}, delegating...`)
            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

            logger.debug('Staking to sponsorship...')
            await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()
            logger.debug(`staked on sponsorship ${sponsorship1.address}`)
            await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)

            await waitForCondition(() => eventcount === 2, 10000, 1000)

            topologyHelper.stop()
        })

        it('client returns all streams from theGraph on initial startup as event', async () => {
            await wait(5000)
            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                streams = streams.concat(streamid)
            })

            await topologyHelper.start()
            await wait(3000)
            logger.debug(`streams: ${JSON.stringify(streams)}`)
            expect(streams.length).toEqual(2)
            expect(streams).toContain(streamId1)
            expect(streams).toContain(streamId2)

            topologyHelper.stop()
        })

        it('client catches onchain events and emits join and leave events', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
            })
            topologyHelper.on('removeStakedStream', (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
                eventcount += 1
            })
            await topologyHelper.start()
            await wait(2000)

            logger.debug('Staking to sponsorship...')
            await (await operatorContract.unstake(sponsorship1.address)).wait()
            logger.debug(`staked on sponsorship ${sponsorship1.address}`)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)
            await waitForCondition(() => eventcount === 2, 10000, 1000)
            topologyHelper.stop()
        })
    })

    describe('edge cases', () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship1: Contract
        let sponsorship2: Contract
        let topologyHelper: MaintainTopologyHelper

        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract({
                provider,
                chainConfig,
            }))
        })

        afterEach(async () => {
            topologyHelper.stop()
            operatorContract.provider.removeAllListeners()
        })

        it('edge cases, 2 sponsorships for the same stream, join only fired once', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let receivedAddStreams = 0
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                receivedAddStreams += 1
            })
            topologyHelper.on('removeStakedStream', (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await wait(2000)
            await topologyHelper.start()

            logger.debug('Added OperatorClient listeners, deploying Sponsorship contract...')
            sponsorship1 = await deploySponsorship({ chainConfig, deployer: operatorWallet, streamId: streamId1 })
            sponsorship2 = await deploySponsorship({ chainConfig, deployer: operatorWallet, streamId: streamId1 })

            logger.debug(`Sponsorship deployed at ${sponsorship1.address}, delegating...`)
            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()

            logger.debug('Staking to sponsorship 1...')
            await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()
            logger.debug(`staked on sponsorship ${sponsorship1.address}`)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)
            logger.debug('Staking to sponsorship 2...')
            await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)

            await wait(10000) // wait for events to be processed

            topologyHelper.stop()

        })

        it('only returns the stream from getAllStreams when staked on 2 sponsorships for the stream', async () => {

            const operatorClient = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            operatorClient.on('addStakedStreams', (streamIDs: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamIDs}`)
                streams = streamIDs
            })
            operatorClient.on('removeStakedStream', (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await operatorClient.start()
            await waitForCondition(() => streams.length === 1, 10000, 1000)
            expect(streams).toContain(streamId1)
            operatorClient.stop()
        })

        it('edge cases, 2 sponsorships for the same stream, remove only fired once', async () => {

            topologyHelper = new MaintainTopologyHelper(operatorConfig)
            let receivedRemoveStreams = 0
            topologyHelper.on('addStakedStreams', (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
            })
            topologyHelper.on('removeStakedStream', (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
                receivedRemoveStreams += 1
            })
            await topologyHelper.start()

            await wait(3000)

            logger.debug('Unstaking from sponsorship1...')
            await (await operatorContract.unstake(sponsorship1.address)).wait()
            logger.debug(`unstaked from sponsorship1 ${sponsorship1.address}`)
            await waitForCondition(() => receivedRemoveStreams === 0, 10000, 1000)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 1, 10000, 1000)

            topologyHelper.stop()
        })
    })
})
