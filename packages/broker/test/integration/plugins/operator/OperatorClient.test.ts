import { JsonRpcProvider, Provider } from "@ethersproject/providers"
import { OperatorClient, OperatorClientConfig } from '../../../../src/plugins/operator/OperatorClient'
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, waitForCondition } from '@streamr/utils'
import fetch from "node-fetch"

import type { IERC677, Operator } from "@streamr/network-contracts"
import type { StreamRegistry } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { streamRegistryABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"

const config = Chains.load()["dev1"]
const adminPrivKey = "0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae"
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

jest.setTimeout(60 * 1000)

describe("OperatorClient", () => {
    const chainURL = config.rpcEndpoints[0].url

    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: IERC677
    let adminWallet: Wallet
    let streamId1: string
    let streamId2: string

    let opertatorConfig: OperatorClientConfig

    const deployNewOperator = async () => {
        const operatorWallet = Wallet.createRandom().connect(provider)
        logger.debug("Funding", { address: operatorWallet.address })
        await (await token.transfer(operatorWallet.address, parseEther("1000"))).wait()
        await (await adminWallet.sendTransaction({
            to: operatorWallet.address,
            value: parseEther("1")
        })).wait()

        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(config, operatorWallet)
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        opertatorConfig = {
            operatorContractAddress: operatorContract.address,
            provider,
            theGraphUrl,
            fetch
        }
        return { operatorWallet, operatorContract }
    }

    beforeEach(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(adminPrivKey, provider)

        token = new Contract(config.contracts.LINK, tokenABI, adminWallet) as unknown as IERC677
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

        // const operatorWalletBalance = await token.balanceOf(adminWallet.address)
        // logger.debug(`operatorWalletBalance ${operatorWalletBalance}`)

        // await (await token.mint(operatorWallet.address, parseEther("1000000"))).wait()
        // logger.debug(`minted 1000000 tokens to ${operatorWallet.address}`)

        // })

        // beforeEach(async () => {
        ;({ operatorWallet, operatorContract } = await deployNewOperator())
    })

    afterEach(async () => {
        // TODO: call operatorClient.close() instead
        await operatorContract.provider.removeAllListeners()
    })

    it("client emits events when sponsorships are unstaked completely", async () => {
        const operatorClient = new OperatorClient(opertatorConfig, logger)
        await operatorClient.start()
        let eventcount = 0
        operatorClient.on("addStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
        })
        operatorClient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
            eventcount += 1
        })

        logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
        const sponsorship = await deploySponsorship(config, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, {
            streamId: streamId2
        })

        logger.debug(`Sponsorship deployed at ${sponsorship.address}, delegating...`)
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()

        logger.debug("Staking to sponsorship...")
        await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship.address}`)
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship2.address}`)

        logger.debug("Unstaking from sponsorships...")
        await (await operatorContract.unstake(sponsorship.address)).wait()
        logger.debug(`unstaked from sponsorship ${sponsorship.address}`)
        await (await operatorContract.unstake(sponsorship2.address)).wait()
        logger.debug(`unstaked from sponsorship ${sponsorship2.address}`)
        // await setTimeout(() => {}, 20000) // wait for events to be processed

        await waitForCondition(() => eventcount === 2, 10000, 1000)

        operatorClient.stop()
    })

    it("client catches onchain events and emits join and leave events", async () => {

        const operatorClient = new OperatorClient(opertatorConfig, logger)
        await operatorClient.start()
        let eventcount = 0
        operatorClient.on("addStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
            eventcount += 1
        })
        operatorClient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
        })

        logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
        const sponsorship = await deploySponsorship(config, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, {
            streamId: streamId2
        })

        logger.debug(`Sponsorship deployed at ${sponsorship.address}, delegating...`)
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()

        logger.debug("Staking to sponsorship...")
        await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship.address}`)
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship2.address}`)
        // await setTimeout(() => {}, 20000) // wait for events to be processed

        while (eventcount < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            logger.debug("waiting for event")
        }

        operatorClient.stop()
    })

    it("client returns all streams from theGraph", async () => {
        logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
        const sponsorship = await deploySponsorship(config, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, {
            streamId: streamId2
        })

        logger.debug(`Sponsorship deployed at ${sponsorship.address}, delegating...`)
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()

        logger.debug("Staking to sponsorship...")
        await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship.address}`)
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()
        logger.debug(`staked on sponsorship ${sponsorship2.address}`)
        // sleep 5 seconds to make sure theGraph has processed the events
        await new Promise((resolve) => setTimeout(resolve, 5000))
        const operatorClient = new OperatorClient(opertatorConfig, logger)

        await operatorClient.start()
        const streams = await operatorClient.getStakedStreams()
        logger.debug(`streams: ${JSON.stringify(streams)}`)
        expect(streams.length).toEqual(2)
        expect(streams).toContain(streamId1)
        expect(streams).toContain(streamId2)

        operatorClient.stop()
    })

    it("edge cases, 2 sponsorships for the same stream", async () => {

        let operatorClient = new OperatorClient(opertatorConfig, logger)
        await operatorClient.start()
        let receivedAddStreams = 0
        let receivedRemoveStreams = 0
        operatorClient.on("addStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
            receivedAddStreams += 1
        })
        operatorClient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
            receivedRemoveStreams += 1
        })

        logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
        const sponsorship = await deploySponsorship(config, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, {
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
        // logger.debug(`staked on sponsorship ${sponsorship2.address}`)
        // await new Promise((resolve) => setTimeout(resolve, 10000)) // wait for events to be processed
        // expect(receivedAddStreams).to.equal(2)
        await waitForCondition(() => receivedAddStreams === 1, 10000, 1000)

        operatorClient.stop()
        await new Promise((resolve) => setTimeout(resolve, 10000)) // wait for events to be processed

        operatorClient = new OperatorClient(opertatorConfig, logger)
        operatorClient.on("addStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
            receivedAddStreams += 1
        })
        operatorClient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
            receivedRemoveStreams += 1
        })

        await operatorClient.start()

        logger.debug("Unstaking from sponsorship1...")
        await (await operatorContract.unstake(sponsorship.address)).wait()
        logger.debug(`unstaked from sponsorship1 ${sponsorship.address}`)
        // await new Promise((resolve) => setTimeout(resolve, 10000))
        await waitForCondition(() => receivedRemoveStreams === 0, 10000, 1000)
        await (await operatorContract.unstake(sponsorship2.address)).wait()
        // await new Promise((resolve) => setTimeout(resolve, 10000))
        await waitForCondition(() => receivedRemoveStreams === 1, 10000, 1000)

        logger.debug("receivedRemoveStreams: ", { receivedRemoveStreams })
        expect(receivedRemoveStreams).toEqual(1)
        logger.debug("Closing operatorclient...")
        operatorClient.stop()

    })

    it("only returns the stream from getAllStreams when staked on 2 sponsorships for the stream", async () => {
        const { operatorWallet, operatorContract } = await deployNewOperator()

        const operatorClient = new OperatorClient(opertatorConfig, logger)
        await operatorClient.start()
        let receivedAddStreams = 0
        operatorClient.on("addStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
            receivedAddStreams += 1
        })
        operatorClient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
            logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
        })

        logger.debug("Added OperatorClient listeners, deploying Sponsorship contract...")
        const sponsorship = await deploySponsorship(config, operatorWallet, {
            streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, {
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

        await operatorClient.start()
        const streams = await operatorClient.getStakedStreams()
        logger.debug(`streams: ${JSON.stringify(streams)}`)
        expect(streams.length).toEqual(1)
        expect(streams).toContain(streamId1)
        operatorClient.stop()
    })

    // it("instantiate operatorclient with preexisting operator", () => {
    //     const oclient = new OperatorClient(operator.address, provider)
    //     oclient.on("addStakedStream", (streamid: string, blockNumber: number) => {
    //         logger.debug(`got addStakedStream event for stream ${streamid} at block ${blockNumber}`)
    //     })
    //     oclient.on("removeStakedStream", (streamid: string, blockNumber: number) => {
    //         logger.debug(`got removeStakedStream event for stream ${streamid} at block ${blockNumber}`)
    //     })
    // })

    // it("emits addStakedStream/removeStakedStream only when the first/last Sponsorship for a stream is un/staked to/from", () => {
    // create 2 Sponsorship contracts for the same stream
    // stake, expect addStakedStream
    // stake, expect nothing
    // unstake, expect nothing
    // unstake, expect removeStakedStream
    // })
})
