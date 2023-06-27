import { JsonRpcProvider, Provider } from "@ethersproject/providers"
import { MaintainTopologyHelper } from '../../../../src/plugins/operator/MaintainTopologyHelper'
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

import type { IERC677, Operator } from "@streamr/network-contracts"
import type { StreamRegistry } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { streamRegistryABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { generateWalletWithGasAndTokens } from "./smartContractUtils"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

jest.setTimeout(60 * 1000)

describe("MaintainTopologyHelper", () => {
    const chainURL = config.rpcEndpoints[0].url

    let provider: Provider
    let token: TestToken
    let adminWallet: Wallet
    let streamId1: string
    let streamId2: string

    beforeAll(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug("Connected to: ", await provider.getNetwork())

        const streamCreatorKey = "0xfe1d528b7e204a5bdfb7668a1ed3adfee45b4b96960a175c9ef0ad16dd58d728"
        adminWallet = new Wallet(streamCreatorKey, provider)

        token = new Contract(config.contracts.LINK, tokenABI) as unknown as TestToken
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = "/operatorclienttest-1-" + timeString
        const streamPath2 = "/operatorclienttest-2-" + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        const streamRegistry = new Contract(config.contracts.StreamRegistry, streamRegistryABI, adminWallet) as unknown as StreamRegistry
        logger.debug(`creating stream with streamId1 ${streamId1}`)
        await (await streamRegistry.createStream(streamPath1, "metadata")).wait()
        logger.debug(`creating stream with streamId2 ${streamId2}`)
        await (await streamRegistry.createStream(streamPath2, "metadata")).wait()
    })

    describe("maintain topology service normal wolkflow", () => {
        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship: Contract
        let sponsorship2: Contract
        let operatorClient: MaintainTopologyHelper
        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch))
        })
        afterEach(async () => {
            operatorClient.stop()
            await operatorContract.provider.removeAllListeners()
        })

        it("client emits events when sponsorships are staked", async () => {
            operatorClient = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            operatorClient.on("addStakedStream", (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                eventcount += 1
            })
            operatorClient.on("removeStakedStream", (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await operatorClient.start()
            
            logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
            sponsorship = await deploySponsorship(config, operatorWallet, {
                streamId: streamId1 })
            sponsorship2 = await deploySponsorship(config, operatorWallet, {
                streamId: streamId2
            })

            logger.debug(`Sponsorship deployed at ${sponsorship.address}, delegating...`)
            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()

            logger.debug("Staking to sponsorship...")
            await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
            logger.debug(`staked on sponsorship ${sponsorship.address}`)
            await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)

            await waitForCondition(() => eventcount === 2, 10000, 1000)

            operatorClient.stop()
        })

        it("client returns all streams from theGraph on initial startup as event", async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            operatorClient = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            operatorClient.on("addStakedStream", (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                streams = streams.concat(streamid)
            })

            await operatorClient.start()
            await new Promise((resolve) => setTimeout(resolve, 3000))
            logger.debug(`streams: ${JSON.stringify(streams)}`)
            expect(streams.length).toEqual(2)
            expect(streams).toContain(streamId1)
            expect(streams).toContain(streamId2)

            operatorClient.stop()
        })

        it("client catches onchain events and emits join and leave events", async () => {

            operatorClient = new MaintainTopologyHelper(operatorConfig)
            let eventcount = 0
            operatorClient.on("addStakedStream", (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
            })
            operatorClient.on("removeStakedStream", (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
                eventcount += 1
            })
            await operatorClient.start()
            await new Promise((resolve) => setTimeout(resolve, 2000))

            logger.debug("Staking to sponsorship...")
            await (await operatorContract.unstake(sponsorship.address)).wait()
            logger.debug(`staked on sponsorship ${sponsorship.address}`)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)
            await waitForCondition(() => eventcount === 2, 10000, 1000)
            operatorClient.stop()
        })
    })

    describe("maintain topology workflow edge cases", () => {

        let operatorWallet: Wallet
        let operatorContract: Operator
        let operatorConfig: OperatorServiceConfig
        let sponsorship: Contract
        let sponsorship2: Contract
        let operatorClient: MaintainTopologyHelper

        beforeAll(async () => {
            ({ operatorWallet, operatorContract, operatorConfig } = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch))
        })
        afterEach(async () => {
            operatorClient.stop()
            await operatorContract.provider.removeAllListeners()
        })

        it("edge cases, 2 sponsorships for the same stream, join only fired once", async () => {

            operatorClient = new MaintainTopologyHelper(operatorConfig)
            let receivedAddStreams = 0
            operatorClient.on("addStakedStream", (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
                receivedAddStreams += 1
            })
            operatorClient.on("removeStakedStream", (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await new Promise((resolve) => setTimeout(resolve, 2000))
            await operatorClient.start()

            logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
            sponsorship = await deploySponsorship(config, operatorWallet, {
                streamId: streamId1 })
            sponsorship2 = await deploySponsorship(config, operatorWallet, {
                streamId: streamId1
            })

            logger.debug(`Sponsorship deployed at ${sponsorship.address}, delegating...`)
            await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()

            logger.debug("Staking to sponsorship 1...")
            await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
            logger.debug(`staked on sponsorship ${sponsorship.address}`)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)
            logger.debug("Staking to sponsorship 2...")
            await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
            logger.debug(`staked on sponsorship ${sponsorship2.address}`)
            await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)

            await new Promise((resolve) => setTimeout(resolve, 10000)) // wait for events to be processed

            operatorClient.stop()

        })

        it("only returns the stream from getAllStreams when staked on 2 sponsorships for the stream", async () => {

            const operatorClient = new MaintainTopologyHelper(operatorConfig)
            let streams: string[] = []
            operatorClient.on("addStakedStream", (streamIDs: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamIDs}`)
                streams = streamIDs
            })
            operatorClient.on("removeStakedStream", (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
            })
            await operatorClient.start()
            await waitForCondition(() => streams.length === 1, 10000, 1000)
            expect(streams).toContain(streamId1)
            operatorClient.stop()
        })

        it("edge cases, 2 sponsorships for the same stream, remove only fired once", async () => {

            operatorClient = new MaintainTopologyHelper(operatorConfig)
            let receivedRemoveStreams = 0
            operatorClient.on("addStakedStream", (streamid: string[]) => {
                logger.debug(`got addStakedStream event for stream ${streamid}`)
            })
            operatorClient.on("removeStakedStream", (streamid: string) => {
                logger.debug(`got removeStakedStream event for stream ${streamid}`)
                receivedRemoveStreams += 1
            })
            await operatorClient.start()

            await new Promise((resolve) => setTimeout(resolve, 3000))

            logger.debug("Unstaking from sponsorship1...")
            await (await operatorContract.unstake(sponsorship.address)).wait()
            logger.debug(`unstaked from sponsorship1 ${sponsorship.address}`)
            await waitForCondition(() => receivedRemoveStreams === 0, 10000, 1000)
            await (await operatorContract.unstake(sponsorship2.address)).wait()
            await waitForCondition(() => receivedRemoveStreams === 1, 10000, 1000)

            operatorClient.stop()
        })
    })
})
