import { Provider } from "@ethersproject/providers"
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

import { deploySponsorship } from "./deploySponsorshipContract"
import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { ADMIN_WALLET_PK, deployOperatorContract, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

describe("MaintainOperatorValueService", () => {
    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: IERC677
    let adminWallet: Wallet
    let streamId1: string
    let streamId2: string

    let operatorConfig: OperatorServiceConfig

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(operatorWallet)
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        operatorConfig = {
            operatorContractAddress: operatorContract.address,
            provider,
            theGraphUrl,
            fetch,
            signer: operatorWallet
        }
        return { operatorWallet, operatorContract }
    }

    beforeEach(async () => {
        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(ADMIN_WALLET_PK, provider)

        token = new Contract(config.contracts.LINK, tokenABI, adminWallet) as unknown as IERC677
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = "/operatorvalueservicetest-1-" + timeString
        const streamPath2 = "/operatorvalueservicetest-2-" + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        const streamRegistry = new Contract(config.contracts.StreamRegistry, streamRegistryABI, adminWallet) as unknown as StreamRegistry
        logger.debug(`Creating stream with streamId1 ${streamId1}`)
        await (await streamRegistry.createStream(streamPath1, "metadata")).wait()
        logger.debug(`Creating stream with streamId2 ${streamId2}`)
        await (await streamRegistry.createStream(streamPath2, "metadata")).wait();
        
        ({ operatorWallet, operatorContract } = await deployNewOperator())
    }, 60 * 1000)

    it("updates both sponsorships to stay over the threshold", async () => {
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        // deploy 2 sponsorships, sponsor 200 & stake 100 into both of them
        for (const streamId of [streamId1, streamId2]) {
            const sponsorship = await deploySponsorship(config, operatorWallet, { streamId })
            await (await token.connect(operatorWallet).transferAndCall(sponsorship.address, parseEther("200"), "0x")).wait()
            await (await operatorContract.stake(sponsorship.address, parseEther("100"))).wait()
            expect(await token.balanceOf(sponsorship.address)).toEqual(parseEther("300")) // 200 sponsored + 100 staked
        }
        
        const penaltyFraction = parseEther("0.0005")
        const threshold = penaltyFraction.mul(200).toBigInt()
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, penaltyFraction.toBigInt())

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()

        // wait for sponsorships to accumulate earnings so approximate values differ enough form the real values
        await wait(3000)

        maintainOperatorValueService.start()

        await waitForCondition(async () => await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore, 10000, 1000)
        
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let diff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
        }
        
        expect((await operatorContract.totalValueInSponsorshipsWei()).toBigInt()).toBeGreaterThan(totalValueInSponsorshipsBefore.toBigInt())
        expect(diff).toBeLessThan(threshold)

        await maintainOperatorValueService.stop()
    }, 60 * 1000)

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
        
        const penaltyFraction = parseEther("0.0005")
        const threshold = penaltyFraction.mul(200).toBigInt()
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, penaltyFraction.toBigInt())

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()

        // wait for sponsorships to accumulate earnings so approximate values differ enough form the real values
        await wait(3000)

        maintainOperatorValueService.start()

        await waitForCondition(async () => await operatorContract.totalValueInSponsorshipsWei() > totalValueInSponsorshipsBefore, 10000, 1000)
        
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let diff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
        }
        
        expect((await operatorContract.totalValueInSponsorshipsWei()).toBigInt()).toBeGreaterThan(totalValueInSponsorshipsBefore.toBigInt())
        expect(diff).toBeLessThan(threshold)

        await maintainOperatorValueService.stop()
    }, 60 * 1000)
})
