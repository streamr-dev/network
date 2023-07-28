import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { parseEther, formatEther } from "@ethersproject/units"

import { tokenABI, TestToken, Operator, StreamrEnvDeployer } from "@streamr/network-contracts"
import { EthereumAddress, Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { ADMIN_WALLET_PK, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"

import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { OperatorValueBreachWatcher } from "../../../../src/plugins/operator/OperatorValueBreachWatcher"

import { STREAMR_DOCKER_DEV_HOST, createClient } from '../../../utils'

import type { Chain } from "@streamr/config"

const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8000/subgraphs/name/streamr-dev/network-subgraphs`

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

describe("OperatorValueBreachWatcher", () => {
    let provider: Provider
    let token: TestToken
    let streamId: string
    let config: Chain

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(config, operatorWallet, { operatorSharePercent: 10 })
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        const operatorConfig = {
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            provider,
            theGraphUrl,
            signer: operatorWallet,
            maxSponsorshipsCount: 20,
            minSponsorshipEarnings: 1
        }
        return { operatorWallet, operatorContract, operatorConfig }
    }

    beforeAll(async () => {
        const streamrEnvDeployer = new StreamrEnvDeployer(ADMIN_WALLET_PK, `http://${STREAMR_DOCKER_DEV_HOST}:8546`)
        await streamrEnvDeployer.deployEnvironment()
        const { contracts } = streamrEnvDeployer
        config = { contracts: streamrEnvDeployer.addresses } as unknown as Chain

        const client = createClient(ADMIN_WALLET_PK)
        streamId = (await client.createStream(`/operatorvaluewatchertest-${Date.now()}`)).id
        await client.destroy()

        // TODO: streamExists=false?!
        const streamExists = await contracts.streamRegistry.exists(streamId)
        logger.debug("Stream created:", { streamId, streamExists })

        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        token = new Contract(config.contracts.DATA, tokenABI) as unknown as TestToken
    }, 60 * 1000)

    it("withdraws sponsorship earnings when earnings are above the threshold", async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await deployNewOperator()

        const sponsorship1 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther("250"), "0x")).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther("100"))).wait()

        const sponsorship2 = await deploySponsorship(config, operatorWallet, { streamId, earningsPerSecond: parseEther("2") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther("250"), "0x")).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(operatorConfig)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const allowedDifference = poolValueBeforeWithdraw.div("10").toBigInt()

        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > allowedDifference, 10000, 1000)
        // await operatorValueBreachWatcher.start()
        await operatorValueBreachWatcher.checkUnwithdrawnEarningsOf(operatorContract.address as EthereumAddress)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < allowedDifference, 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await operatorValueBreachWatcher.stop()
    }, 60 * 1000)
})
