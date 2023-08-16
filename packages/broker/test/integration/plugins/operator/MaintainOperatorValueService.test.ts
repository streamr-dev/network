import { Provider } from "@ethersproject/providers"
import { config as CHAIN_CONFIG } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, waitForCondition } from '@streamr/utils'

import type { TestToken, Operator } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"
import { JsonRpcProvider } from "@ethersproject/providers"
import { formatEther } from "@ethersproject/units"

import { streamRegistryABI, StreamRegistry } from "@streamr/network-contracts"
import { toEthereumAddress } from '@streamr/utils'

import { deployOperatorContract } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { ADMIN_WALLET_PK, generateWalletWithGasAndTokens } from "./smartContractUtils"

import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { getProvider } from "./smartContractUtils"
import { createClient } from "../../../utils"
import { setupOperatorContract } from "./setupOperatorContract"
import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'

const chainConfig = CHAIN_CONFIG["dev2"]

const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8000/subgraphs/name/streamr-dev/network-subgraphs`
const logger = new Logger(module)

async function getTotalUnwithdrawnEarnings(operatorContract: Operator): Promise<bigint> {
    const { earnings } = await operatorContract.getEarningsFromSponsorships()
    let unwithdrawnEarnings = BigInt(0)
    for (const e of earnings) {
        unwithdrawnEarnings += e.toBigInt()
    }
    logger.debug(`Total unwithdrawn earnings: ${formatEther(unwithdrawnEarnings.toString())} DATA (t = ${Date.now()})`)
    return unwithdrawnEarnings
}

describe("MaintainOperatorValueService", () => {
    let provider: Provider
    let token: TestToken
    let streamId: string

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider, chainConfig)
        logger.debug("Deploying operator contract")
        const operatorContract = await deployOperatorContract(chainConfig, operatorWallet, { operatorSharePercent: 10 })
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
        provider = new JsonRpcProvider(`http://${STREAMR_DOCKER_DEV_HOST}:8547`)
        logger.debug("Connected to: ", await provider.getNetwork())

        const adminWallet = new Wallet(ADMIN_WALLET_PK, provider)
        const streamRegistry = new Contract(chainConfig.contracts.StreamRegistry, streamRegistryABI, adminWallet) as unknown as StreamRegistry
        
        logger.debug("Creating stream for the test")
        const createStreamReceipt = await (await streamRegistry.createStream(
            `/operatorvaluewatchertest-${Date.now()}`,
            '{"partitions":1}"}')
        ).wait()
        streamId = createStreamReceipt.events?.find((e) => e.event === "StreamCreated")?.args?.id
        const streamExists = await streamRegistry.exists(streamId)
        logger.debug("Stream created:", { streamId, streamExists })
        // TODO: use createClient once configs allow it. For now I'm creating the stream directly using the contract
        // const client = createClient(ADMIN_WALLET_PK, {
        //     contracts: {
        //         streamRegistryChainAddress: contracts.streamRegistry.address,
        //     },
        // })
        // streamId = (await client.createStream(`/operatorvaluewatchertest-${Date.now()}`)).id
        // await client.destroy()

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken
    }, 60 * 1000)

    it("withdraws sponsorship earnings when earnings are above the safe threshold", async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await deployNewOperator()

        const sponsorship1 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther("1") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther("250"), "0x")).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther("200"), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther("100"))).wait()

        const sponsorship2 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther("2") })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther("250"), "0x")).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther("100"))).wait()

        // 1000 = check every second
        const service = new MaintainOperatorValueService(operatorConfig, 0.5, 1000)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        // safe threshold is 5 DATA, that's when withdraw happens
        await service.start()

        // wait until we see the withdraw happened: first we go above a sum (that must be < safe threshold), then below
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > parseEther("3").toBigInt(), 10000, 1000)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < parseEther("3").toBigInt(), 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await service.stop()
    }, 60 * 1000)
})

