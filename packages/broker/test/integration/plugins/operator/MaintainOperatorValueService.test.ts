import { Provider } from "@ethersproject/providers"
import { parseEther, formatEther } from "@ethersproject/units"
import { Contract } from "@ethersproject/contracts"

import { Chains } from "@streamr/config"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { tokenABI, TestToken, Operator } from "@streamr/network-contracts"

import { deploySponsorship } from "./deploySponsorshipContract"
import { ADMIN_WALLET_PK, deployOperatorContract, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"

import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { createClient } from "../../../utils"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

async function getTotalUnwithdrawnEarnings(operatorContract: Operator): Promise<bigint> {
    const { earnings } = await operatorContract.getEarningsFromSponsorships()
    let unwithdrawnEarnings = BigInt(0)
    for (const e of earnings) {
        unwithdrawnEarnings += e.toBigInt()
    }
    logger.debug(`Total unwithdrawn earnings: ${formatEther(unwithdrawnEarnings.toString())} (t = ${Date.now()})`)
    return unwithdrawnEarnings
}

// test is outdated, is completely rewritten and will be merged with PR #1629 
describe.skip("MaintainOperatorValueService", () => {
    let provider: Provider
    let token: TestToken
    let streamId1: string
    let streamId2: string
    let streamId3: string

    let operatorConfig: OperatorServiceConfig

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(operatorWallet)
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        operatorConfig = {
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            provider,
            theGraphUrl,
            signer: operatorWallet,
            maxSponsorshipsCount: 20,
            minSponsorshipEarnings: 1 // full tokens
        }
        return { operatorWallet, operatorContract }
    }

    beforeAll(async () => {
        const client = createClient(ADMIN_WALLET_PK)
        logger.debug("Creating stream 1")
        streamId1 = (await client.createStream(`/operatorvalueservicetest-1-${Date.now()}`)).id
        logger.debug("Creating stream 2")
        streamId2 = (await client.createStream(`/operatorvalueservicetest-2-${Date.now()}`)).id
        logger.debug("Creating stream 3")
        streamId3 = (await client.createStream(`/operatorvalueservicetest-3-${Date.now()}`)).id
        logger.debug("Done creating streams")
        token = new Contract(config.contracts.LINK, tokenABI, provider) as TestToken
        await client.destroy()
    }, 20 * 1000)

    it("withdraws from all Sponsorships that give more than minimum", async () => {
        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        const { operatorWallet, operatorContract } = await deployNewOperator()

        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("100"), operatorWallet.address)).wait()

        const sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId: streamId1, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther("100"), "0x")).wait()

        // const streamrConfig = new Contract(await operatorContract.streamrConfig(), streamrConfigABI, provider) as StreamrConfig
        // logger.debug(`Streamr config address: ${streamrConfig.address}`)
        // logger.debug(`Streamr config bytecode: ${await provider.getCode(streamrConfig.address)}`)
        // const sponsorshipFactoryAddress = await streamrConfig.sponsorshipFactory()
        // logger.debug(`Sponsorship factory address: ${sponsorshipFactoryAddress}`)
        // const sponsorshipFactory = new Contract(sponsorshipFactoryAddress, sponsorshipFactoryABI, provider) as SponsorshipFactory
        // logger.debug(`Sponsorship deployment timestamp: ${await sponsorshipFactory.deploymentTimestamp(sponsorship1.address)}`)
        logger.debug(`Operator contract free funds: ${await token.connect(operatorWallet).balanceOf(operatorContract.address)}`)
        await (await operatorContract.stake(sponsorship1.address, parseEther("20"))).wait()

        const sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId: streamId2, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther("100"), "0x")).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther("20"))).wait()

        // non-paying sponsorship3 should not be withdrawn, it has only given 0.5 token earnings < minSponsorshipEarnings
        const sponsorship3 = await deploySponsorship(config, operatorWallet, { streamId: streamId3, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship3.address, parseEther("0.5"), "0x")).wait()
        await (await operatorContract.stake(sponsorship3.address, parseEther("20"))).wait()

        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, 0.5)

        const poolValueBefore = await operatorContract.getApproximatePoolValue()
        const earnings3before = await operatorContract.getEarningsFromSponsorship(sponsorship3.address)

        // accumulate some earnings: limit is at 10% of 20+20+20 = 6 full tokens = 6e18 wei, which should happen in 3 seconds (polling every 1s)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > BigInt(6e18), 10000, 1000)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        await maintainOperatorValueService.start()

        // wait for the service to do the withdraw, should get below the limit and stay for at least 3 seconds (polled every 1s)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < BigInt(6e18), 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        const earnings3after = await operatorContract.getEarningsFromSponsorship(sponsorship3.address)

        await maintainOperatorValueService.stop()

        expect(poolValueBeforeWithdraw.toBigInt()).toEqual(poolValueBefore.toBigInt())
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())
        expect(formatEther(earnings3before)).toEqual("0.5")
        expect(formatEther(earnings3after)).toEqual("0.5")
    }, 60 * 1000)
})

