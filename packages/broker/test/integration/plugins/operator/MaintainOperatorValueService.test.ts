import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { parseEther, formatEther } from "@ethersproject/units"

import { Chains } from "@streamr/config"
import { tokenABI, TestToken, Operator } from "@streamr/network-contracts"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { ADMIN_WALLET_PK, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"

import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { createClient } from "../../../utils"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

const SPONSOR_AMOUNT = 250
const STAKE_AMOUNT = 100
const PENALTY_LIMIT_FRACTION = parseEther("0.1")

async function getTotalUnwithdrawnEarnings(operatorContract: Operator): Promise<bigint> {
    const { earnings } = await operatorContract.getEarningsFromSponsorships()
    let unwithdrawnEarnings = BigInt(0)
    for (const e of earnings) {
        unwithdrawnEarnings += e.toBigInt()
    }
    logger.debug(`Total unwithdrawn earnings: ${formatEther(unwithdrawnEarnings.toString())} (t = ${Date.now()})`)
    return unwithdrawnEarnings
}

describe("MaintainOperatorValueService", () => {
    let provider: Provider
    let token: TestToken
    let streamId: string

    let operatorConfig: OperatorServiceConfig

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(config, operatorWallet, { operatorSharePercent: 10 })
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
        streamId = (await client.createStream(`/operatorvalueservicetest-${Date.now()}`)).id

        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        token = new Contract(config.contracts.LINK, tokenABI, provider) as TestToken
        await client.destroy()
    }, 60 * 1000)

    it("withdraws sponsorship earnings when earnings are above the safe threshold", async () => {
        const { operatorWallet, operatorContract } = await deployNewOperator()

        const sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther(`${SPONSOR_AMOUNT}`), "0x")).wait()
        await (
            await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther(`${STAKE_AMOUNT * 2}`), operatorWallet.address)
        ).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther(`${STAKE_AMOUNT}`))).wait()

        const sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("2") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther(`${SPONSOR_AMOUNT}`), "0x")).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther(`${STAKE_AMOUNT}`))).wait()

        const withdrawLimitSafetyFraction = 0.5
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, withdrawLimitSafetyFraction)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const allowedDifference: bigint = poolValueBeforeWithdraw.mul(PENALTY_LIMIT_FRACTION).div(parseEther("1")).toBigInt()
        const safeAllowedDifference: bigint = allowedDifference * BigInt(withdrawLimitSafetyFraction * 1e18) / BigInt(1e18)

        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > safeAllowedDifference, 10000, 1000)
        await maintainOperatorValueService.start()
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < safeAllowedDifference, 10000, 1000)
        
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await maintainOperatorValueService.stop()
    }, 60 * 1000)
})

