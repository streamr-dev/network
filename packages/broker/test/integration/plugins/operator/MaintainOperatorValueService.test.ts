import { Provider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Wallet } from "@ethersproject/wallet"
import { parseEther } from "@ethersproject/units"
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'

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

const SPONSOR_AMOUNT = 250
const STAKE_AMOUNT = 100

describe("MaintainOperatorValueService", () => {
    let provider: Provider
    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: IERC677
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
            signer: operatorWallet
        }
        return { operatorWallet, operatorContract }
    }

    const getDiffBetweenApproxAndRealValues = async (): Promise<bigint> => {
        const { sponsorshipAddresses, approxValues, realValues } = await operatorContract.getApproximatePoolValuesPerSponsorship()
        let totalDiff = BigInt(0)
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            const diff = realValues[i].toBigInt() - approxValues[i].toBigInt()
            totalDiff += diff
        }
        return totalDiff
    }

    beforeAll(async () => {
        const client = new StreamrClient({
            ...CONFIG_TEST,
            auth: {
                privateKey: ADMIN_WALLET_PK
            }
        })
        streamId1 = (await client.createStream(`/operatorvalueservicetest-1-${Date.now()}`)).id
        streamId2 = (await client.createStream(`/operatorvalueservicetest-2-${Date.now()}`)).id
        await client.destroy()
    })

    beforeEach(async () => {
        provider = getProvider()
        logger.debug("Connected to: ", await provider.getNetwork())

        token = new Contract(config.contracts.LINK, tokenABI) as unknown as IERC677

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

    // TODO: split into two test, where one verifies that not all sponsorships are used to update
    // .each([parseEther("0.001"),]
    test("updates only some (1) of the sponsorships to get under the threshold", async () => {
        const penaltyFraction = parseEther("0.001")
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, penaltyFraction.toBigInt())

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()

        const approxValuesBefore = (await operatorContract.getApproximatePoolValuesPerSponsorship()).approxValues
        for (const approxValue of approxValuesBefore) {
            logger.debug(`approxValue: ${approxValue.toString()}`)
        }

        await waitForCondition(async () => {
            const diff = await getDiffBetweenApproxAndRealValues()
            const poolValue = await operatorContract.totalValueInSponsorshipsWei()
            const threshold = penaltyFraction.mul(poolValue).div(parseEther("1")).toBigInt()
            logger.debug(`diff: ${diff}, threshold: ${threshold}`)
            return diff > threshold 
        }, 10000, 1000)

        await maintainOperatorValueService.start()

        await waitForCondition(async () => (await operatorContract.totalValueInSponsorshipsWei()).gt(totalValueInSponsorshipsBefore), 10000, 1000)
        
        const diff = await getDiffBetweenApproxAndRealValues()

        const poolValue = await operatorContract.totalValueInSponsorshipsWei()
        const threshold = penaltyFraction.mul(poolValue).div(parseEther("1")).toBigInt()

        expect((await operatorContract.totalValueInSponsorshipsWei()).toBigInt()).toBeGreaterThan(totalValueInSponsorshipsBefore.toBigInt())
        logger.debug(`at end diff: ${diff}, threshold: ${threshold}`)
        expect(diff).toBeLessThan(threshold)
        const approxValuesAfter = (await operatorContract.getApproximatePoolValuesPerSponsorship()).approxValues
        for (const approxValue of approxValuesAfter) {
            logger.debug(`approxValue: ${approxValue.toString()}`)
        }
        // one of the values should have increased, but not both
        expect((approxValuesAfter[0].toBigInt() > approxValuesBefore[0].toBigInt()
            || approxValuesAfter[1].toBigInt() > approxValuesBefore[1].toBigInt())
            && !((approxValuesAfter[0].toBigInt() > approxValuesBefore[0].toBigInt()
            && approxValuesAfter[1].toBigInt() > approxValuesBefore[1].toBigInt()))).toBeTruthy()

        await maintainOperatorValueService.stop()
    }, 60 * 1000)
})
