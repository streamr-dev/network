import { Provider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, toEthereumAddress } from '@streamr/utils'

import type { TestToken, Operator } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deploySponsorship } from "./deploySponsorshipContract"
import { OperatorValueBreachWatcher } from "../../../../src/plugins/operator/OperatorValueBreachWatcher"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { ADMIN_WALLET_PK, deployOperatorContract, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"
import { createClient } from '../../../utils'

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

const SPONSOR_AMOUNT = 250
const STAKE_AMOUNT = 100

describe("OperatorValueBreachWatcher", () => {
    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: TestToken
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
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            provider,
            theGraphUrl,
            signer: operatorWallet,
            maxSponsorshipsCount: 20,
            minSponsorshipEarnings: 0.01
        }
        return { operatorWallet, operatorContract }
    }

    beforeEach(async () => {
        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(ADMIN_WALLET_PK, provider)

        token = new Contract(config.contracts.LINK, tokenABI, adminWallet) as unknown as TestToken
        const client = createClient(ADMIN_WALLET_PK)
        streamId1 = (await client.createStream(`/operatorvalueservicetest-1-${Date.now()}`)).id
        streamId2 = (await client.createStream(`/operatorvalueservicetest-2-${Date.now()}`)).id
        await client.destroy();

        ({ operatorWallet, operatorContract } = await deployNewOperator())

        await (
            await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther(`${STAKE_AMOUNT * 2}`), operatorWallet.address)
        ).wait()
        for (const streamId of [streamId1, streamId2]) {
            const sponsorship = await deploySponsorship(config, operatorWallet, { streamId })
            await (await token.connect(operatorWallet).transferAndCall(sponsorship.address, parseEther(`${SPONSOR_AMOUNT}`), "0x")).wait()
            await (await operatorContract.stake(sponsorship.address, parseEther(`${STAKE_AMOUNT}`))).wait()
        }

        const watcher = new OperatorValueBreachWatcher(operatorConfig)
        console.log("Starting watcher")
        await watcher.start()
        console.log("Watcher started")
        await watcher.stop()
        console.log("Watcher stopped")
    }, 60 * 1000)

    test("rewards the watcher for withdrawing from sponsorships", async () => {
        // TODO
    }, 60 * 1000)
})
