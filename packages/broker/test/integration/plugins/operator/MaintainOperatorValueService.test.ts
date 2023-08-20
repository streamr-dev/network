import { parseEther } from '@ethersproject/units'
import { Wallet } from '@ethersproject/wallet'
import type { Operator, TestToken } from '@streamr/network-contracts'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, waitForCondition } from '@streamr/utils'
import { MaintainOperatorValueService } from '../../../../src/plugins/operator/MaintainOperatorValueService'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { createClient, createTestStream } from '../../../utils'
import { deploySponsorshipContract, getTokenContract, setupOperatorContract } from './contractUtils'

const logger = new Logger(module)

const SPONSOR_AMOUNT = 250
const STAKE_AMOUNT = 100

// test is outdated, is completely rewritten and will be merged with PR #1629 
describe.skip('MaintainOperatorValueService', () => {

    let operatorWallet: Wallet
    let operatorContract: Operator
    let token: TestToken
    let streamId1: string
    let streamId2: string

    let operatorConfig: OperatorServiceConfig

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
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId1 = (await createTestStream(client, module)).id
        streamId2 = (await createTestStream(client, module)).id
        await client.destroy()
    })

    beforeEach(async () => {
        token = getTokenContract()

        ;({ operatorWallet, operatorContract } = await setupOperatorContract())

        await (
            await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther(`${STAKE_AMOUNT * 2}`), operatorWallet.address)
        ).wait()
        for (const streamId of [streamId1, streamId2]) {
            const sponsorship = await deploySponsorshipContract({ deployer: operatorWallet, streamId })
            await (await token.connect(operatorWallet).transferAndCall(sponsorship.address, parseEther(`${SPONSOR_AMOUNT}`), '0x')).wait()
            await (await operatorContract.stake(sponsorship.address, parseEther(`${STAKE_AMOUNT}`))).wait()
        }
    }, 60 * 1000)

    // TODO: split into two test, where one verifies that not all sponsorships are used to update
    // .each([parseEther("0.001"),]
    test('updates only some (1) of the sponsorships to get under the threshold', async () => {
        const penaltyFraction = parseEther('0.001')
        const maintainOperatorValueService = new MaintainOperatorValueService(operatorConfig, penaltyFraction.toBigInt())

        const totalValueInSponsorshipsBefore = await operatorContract.totalValueInSponsorshipsWei()

        const approxValuesBefore = (await operatorContract.getApproximatePoolValuesPerSponsorship()).approxValues
        for (const approxValue of approxValuesBefore) {
            logger.debug(`approxValue: ${approxValue.toString()}`)
        }

        await waitForCondition(async () => {
            const diff = await getDiffBetweenApproxAndRealValues()
            const poolValue = await operatorContract.totalValueInSponsorshipsWei()
            const threshold = penaltyFraction.mul(poolValue).div(parseEther('1')).toBigInt()
            logger.debug(`diff: ${diff}, threshold: ${threshold}`)
            return diff > threshold 
        }, 10000, 1000)

        await maintainOperatorValueService.start()

        await waitForCondition(async () => (await operatorContract.totalValueInSponsorshipsWei()).gt(totalValueInSponsorshipsBefore), 10000, 1000)
        
        const diff = await getDiffBetweenApproxAndRealValues()

        const poolValue = await operatorContract.totalValueInSponsorshipsWei()
        const threshold = penaltyFraction.mul(poolValue).div(parseEther('1')).toBigInt()

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

