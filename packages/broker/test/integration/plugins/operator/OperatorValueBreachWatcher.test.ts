import { Provider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther, formatEther } from "@ethersproject/units"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

import type { TestToken, Operator, Sponsorship } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deploySponsorship } from "./deploySponsorshipContract"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { OperatorValueBreachWatcher } from "../../../../src/plugins/operator/OperatorValueBreachWatcher"
import { ADMIN_WALLET_PK, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"
import { createClient } from '../../../utils'
import { BigNumber } from "ethers"
import { deployOperatorContract } from "./deployOperatorContract"

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

describe("OperatorValueBreachWatcher", () => {
    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: TestToken
    let streamId: string
    let sponsorship1: Sponsorship
    let sponsorship2: Sponsorship
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
            minSponsorshipEarnings: 1
        }
        return { operatorWallet, operatorContract }
    }

    beforeAll(async () => {
        const client = createClient(ADMIN_WALLET_PK)
        streamId = (await client.createStream(`/operatorvaluewatchertest-${Date.now()}`)).id
        await client.destroy()

        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        token = new Contract(config.contracts.LINK, tokenABI) as unknown as TestToken
    })

    beforeEach(async () => {
        ({ operatorWallet, operatorContract } = await deployNewOperator())

        sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther(`${SPONSOR_AMOUNT}`), "0x")).wait()
        await (
            await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther(`${STAKE_AMOUNT * 2}`), operatorWallet.address)
        ).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther(`${STAKE_AMOUNT}`))).wait()

        sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("2") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther(`${SPONSOR_AMOUNT}`), "0x")).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther(`${STAKE_AMOUNT}`))).wait()
    }, 60 * 1000)

    it("withdraws sponsorship earnings when earnings are above the threshold", async () => {
        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(operatorConfig)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const allowedDifference = poolValueBeforeWithdraw.mul(PENALTY_LIMIT_FRACTION).div(parseEther("1")).toBigInt()

        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > allowedDifference, 10000, 1000)
        await operatorValueBreachWatcher.start(toEthereumAddress(operatorContract.address))
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < allowedDifference, 10000, 1000)
        // deploy new env w 2 op
        // if should pick the other one
        // test against the "other" one
        // develop agains the fast chain
        
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await operatorValueBreachWatcher.stop()
    }, 60 * 1000)
})
