import { Contract } from "@ethersproject/contracts"
import { Provider, JsonRpcProvider } from "@ethersproject/providers"
import { parseEther, formatEther } from "@ethersproject/units"

import { tokenABI, TestToken, Operator, StreamrEnvDeployer } from "@streamr/network-contracts"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { ADMIN_WALLET_PK, generateWalletWithGasAndTokens } from "./smartContractUtils"

// import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { OperatorValueBreachWatcher } from "../../../../src/plugins/operator/OperatorValueBreachWatcher"

// TODO: use createClient once configs allow it. For now I'm creating the stream directly using the contract
// import { STREAMR_DOCKER_DEV_HOST, createClient } from '../../../utils'
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'

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
        const operatorWallet = await generateWalletWithGasAndTokens(provider, config)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(config, operatorWallet, { operatorSharePercent: 10 })
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        const operatorConfig = {
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            provider,
            theGraphUrl,
            signer: operatorWallet,
            maxSponsorshipsCount: 20,
            minSponsorshipEarnings: 1 // full tokens
        }
        return { operatorWallet, operatorContract, operatorConfig }
    }

    beforeAll(async () => {
        const streamrEnvDeployer = new StreamrEnvDeployer(ADMIN_WALLET_PK, `http://${STREAMR_DOCKER_DEV_HOST}:8547`)
        await streamrEnvDeployer.deployEnvironment()
        const { contracts } = streamrEnvDeployer
        config = { contracts: streamrEnvDeployer.addresses } as unknown as Chain

        // const client = createClient(ADMIN_WALLET_PK, {
        //     contracts: {
        //         streamRegistryChainAddress: contracts.streamRegistry.address,
        //     },
        // })
        // streamId = (await client.createStream(`/operatorvaluewatchertest-${Date.now()}`)).id
        // await client.destroy()

        const createStreamReceipt = await (await contracts.streamRegistry.createStream(
            `/operatorvaluewatchertest-${Date.now()}`,
            '{"partitions":1}"}')
        ).wait()
        streamId = createStreamReceipt.events?.find((e) => e.event === "StreamCreated")?.args?.id

        // TODO: streamExists=false?!
        const streamExists = await contracts.streamRegistry.exists(streamId)
        logger.debug("Stream created:", { streamId, streamExists })

        // provider = getProvider()
        provider = new JsonRpcProvider(`http://${STREAMR_DOCKER_DEV_HOST}:8547`)
        logger.debug("Connected to: ", await provider.getNetwork())

        // token = new Contract(config.contracts.DATA, tokenABI) as unknown as TestToken
        token = new Contract(config.contracts.LINK, tokenABI) as unknown as TestToken
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

        // workaround for fast-chain not producing blocks: force regular "mining"
        // const forcedMiningHandle = setInterval(async () => {
        //     await (provider as any).send("evm_mine", [0])
        // }, 1000)

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(operatorConfig)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const allowedDifference = poolValueBeforeWithdraw.div("10").toBigInt()

        logger.debug("Waiting until above", { allowedDifference })
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > allowedDifference, 10000, 1000)
        // await operatorValueBreachWatcher.start()
        await operatorValueBreachWatcher.checkUnwithdrawnEarningsOf(toEthereumAddress(operatorContract.address))
        logger.debug("Waiting until below", { allowedDifference })
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < allowedDifference, 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await operatorValueBreachWatcher.stop()
        // clearInterval(forcedMiningHandle)
    }, 60 * 1000)
})
