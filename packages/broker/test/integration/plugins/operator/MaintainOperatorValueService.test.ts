import { JsonRpcProvider, Provider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, wait, waitForCondition } from '@streamr/utils'
import fetch from "node-fetch"

import type { IERC677, Operator } from "@streamr/network-contracts"
import type { StreamRegistry } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { streamRegistryABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"

const config = Chains.load()["dev1"]
const adminPrivKey = "0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae"
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

jest.setTimeout(60 * 1000)

describe("MaintainOperatorValueService", () => {
    const chainURL = config.rpcEndpoints[0].url

    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: IERC677
    let adminWallet: Wallet
    let streamId1: string
    let streamId2: string

    let opertatorConfig: OperatorServiceConfig

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
            fetch,
            signer: operatorWallet
        }
        return { operatorWallet, operatorContract }
    }

    beforeEach(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(adminPrivKey, provider)

        token = new Contract(config.contracts.LINK, tokenABI, adminWallet) as unknown as IERC677
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = "/operatorvalueservicetest-1-" + timeString
        const streamPath2 = "/operatorvalueservicetest-2-" + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        const streamRegistry = new Contract(config.contracts.StreamRegistry, streamRegistryABI, adminWallet) as unknown as StreamRegistry
        logger.debug(`creating stream with streamId1 ${streamId1}`)
        await (await streamRegistry.createStream(streamPath1, "metadata")).wait()
        logger.debug(`creating stream with streamId2 ${streamId2}`)
        await (await streamRegistry.createStream(streamPath2, "metadata")).wait();
        
        ({ operatorWallet, operatorContract } = await deployNewOperator())
    })

    it("updates both sponsorships to stay over the threshold", async () => {
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        // deploy 2 sponsorships, sponsor 200 & stake 100 into both of them
        const sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId: streamId2 })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther("200"), "0x")).wait()
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther("200"), "0x")).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther("100"))).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()

        expect(await token.balanceOf(sponsorship1.address)).toEqual(parseEther("300")) // 200 sponsored + 100 staked
        expect(await token.balanceOf(sponsorship2.address)).toEqual(parseEther("300"))
        
        const maintainOperatorValueService = new MaintainOperatorValueService(opertatorConfig)

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()
        const penaltyFraction = 0.0005 // * 1e18
        const threshold = 200 * penaltyFraction // 0.1

        // wait for sponsorships to accumulate earnings so approximate values differ enough form the real values
        await wait(3000)

        maintainOperatorValueService.start(parseEther(`${penaltyFraction}`).toBigInt()) // 200 * 0.001 = 0.1

        await waitForCondition(async () => await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore, 10000, 1000)
        
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let diff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
        }
        
        expect(await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore)
        expect(diff < threshold)

        await maintainOperatorValueService.stop()
    })

    it("needs only one sponsorship to stay over the threshold", async () => {
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        // deploy 2 sponsorships, sponsor 200 & stake 100 into both of them
        const sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId: streamId1 })
        const sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId: streamId2 })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther("200"), "0x")).wait()
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther("200"), "0x")).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther("100"))).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()

        expect(await token.balanceOf(sponsorship1.address)).toEqual(parseEther("300")) // 200 sponsored + 100 staked
        expect(await token.balanceOf(sponsorship2.address)).toEqual(parseEther("300"))
        
        const maintainOperatorValueService = new MaintainOperatorValueService(opertatorConfig)

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()
        const penaltyFraction = 0.0005 // * 1e18
        const threshold = 200 * penaltyFraction // 0.02

        // wait for sponsorships to accumulate earnings so approximate values differ enough form the real values
        await wait(3000)

        maintainOperatorValueService.start(parseEther(`${penaltyFraction}`).toBigInt()) // 200 * 0.001 = 0.02

        await waitForCondition(async () => await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore, 10000, 1000)
        
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let diff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
        }
        
        expect(await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore)
        expect(diff < threshold)

        await maintainOperatorValueService.stop()
    })
})
