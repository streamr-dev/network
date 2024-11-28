import { _operatorContractUtils } from '@streamr/sdk'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, StreamID, toEthereumAddress, until } from '@streamr/utils'
import { multiply } from '../../../../src/helpers/multiply'
import { maintainOperatorValue } from '../../../../src/plugins/operator/maintainOperatorValue'
import { createClient, createTestStream } from '../../../utils'

const {
    delegate,
    deployTestSponsorshipContract,
    createTestWallet,
    setupTestOperatorContract,
    sponsor,
    stake
} = _operatorContractUtils

const logger = new Logger(module)

const SPONSOR_AMOUNT = 25000n
const STAKE_AMOUNT = 10000n
const SAFETY_FRACTION = 0.5  // 50%

describe('maintainOperatorValue', () => {

    let streamId: StreamID

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
    }, 60 * 1000)

    /*
     * We stake 100 tokens and start a sponsorship which generates 1 token of earnings per second. Then we wait
     * until we've earned enough tokens so that the operator value has drifted at least for 2.5 tokens.
     * The default drift limit is 5 token (5% of 100 staked tokens, see StreamrConfig.sol#maxAllowedEarningsFraction
     * in network-contracts), and the configured safe limit in this test is 50%, i.e. 2.5 tokens.
     */
    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, nodeWallets } = await setupTestOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                operatorsCutPercent: 10
            }
        })
        const sponsorer = await createTestWallet()
        const sponsorship = await deployTestSponsorshipContract({ earningsPerSecond: 100n, streamId, deployer: operatorWallet })
        await sponsor(sponsorer, await sponsorship.getAddress(), SPONSOR_AMOUNT)
        await delegate(operatorWallet, await operatorContract.getAddress(), STAKE_AMOUNT)
        await stake(operatorContract, await sponsorship.getAddress(), STAKE_AMOUNT)
        const operator = createClient(nodeWallets[0].privateKey).getOperator(toEthereumAddress(await operatorContract.getAddress()))
        const { maxAllowedEarningsDataWei } = await operator.getEarnings(1, 20)
        const triggerWithdrawLimitDataWei = multiply(maxAllowedEarningsDataWei, 1 - SAFETY_FRACTION)
        await until(async () => {
            const { sumDataWei } = await operator.getEarnings(1, 20)
            const earnings = sumDataWei
            return earnings > triggerWithdrawLimitDataWei
        }, 10000, 1000)
        const valueBeforeWithdraw = await operatorContract.valueWithoutEarnings()

        await maintainOperatorValue(
            SAFETY_FRACTION,
            1,
            20,
            operator
        )
        const valueAfterWithdraw = await operatorContract.valueWithoutEarnings()
        expect(valueAfterWithdraw).toBeGreaterThan(valueBeforeWithdraw)
    }, 60 * 1000)
})
