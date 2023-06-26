import { Provider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, wait, waitForCondition } from '@streamr/utils'
import fetch from "node-fetch"

import type { IERC677, Operator } from "@streamr/network-contracts"

import { tokenABI } from "@streamr/network-contracts"
import { Contract } from "@ethersproject/contracts"

import { deploySponsorship } from "./deploySponsorshipContract"
import { MaintainOperatorValueService } from "../../../../src/plugins/operator/MaintainOperatorValueService"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { ADMIN_WALLET_PK, deployOperatorContract, generateWalletWithGasAndTokens, getProvider } from "./smartContractUtils"
import StreamrClient, { CONFIG_TEST } from "streamr-client"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '127.0.0.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

const SPONSOR_AMOUNT = 200
const STAKE_AMOUNT = 100

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

    const getDiffBetweenApproxAndRealValues = async (): Promise<bigint> => {
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let diff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
        }
        return diff
    }

    beforeEach(async () => {
        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(ADMIN_WALLET_PK, provider)

        token = new Contract(config.contracts.LINK, tokenABI, adminWallet) as unknown as IERC677
        const client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: ADMIN_WALLET_PK
            }
        })
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
    }, 60 * 1000)

    test.each([parseEther("0.001"), parseEther("0.0005")])("updates the sponsorships to stay over the threshold", async (penaltyFraction) => {
        const poolValue = STAKE_AMOUNT * 2
        const threshold = penaltyFraction.mul(poolValue).toBigInt()
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, penaltyFraction.toBigInt())

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()

        // wait for sponsorships to accumulate earnings so approximate values differ enough form the real values
        await wait(3000)

        await maintainOperatorValueService.start()

        await waitForCondition(async () => (await operatorContract.totalValueInSponsorshipsWei()).gt(totalValueInSponsorshipsBefore), 10000, 1000)
        
        const diff = await getDiffBetweenApproxAndRealValues()
        expect((await operatorContract.totalValueInSponsorshipsWei()).toBigInt()).toBeGreaterThan(totalValueInSponsorshipsBefore.toBigInt())
        expect(diff).toBeLessThan(threshold)

        await maintainOperatorValueService.stop()
    }, 60 * 1000)
})
