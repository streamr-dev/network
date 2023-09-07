import { parseEther } from '@ethersproject/units'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, waitForCondition } from '@streamr/utils'
import { createClient, createTestStream } from '../../../utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorPoolValueUtils'
import { MaintainOperatorPoolValueHelper } from '../../../../src/plugins/operator/MaintainOperatorPoolValueHelper'
import { maintainOperatorPoolValue } from '../../../../src/plugins/operator/maintainOperatorPoolValue'

const logger = new Logger(module)

const STAKE_AMOUNT = 100
const ONE_ETHER = 1e18
const SAFETY_FRACTION = 0.5  // 50%

describe('maintainOperatorPoolValue', () => {

    let streamId: string

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
    }, 60 * 1000)

    /*
     * We stake 100 tokens and start a sponsorship which generates 1 token of earnings per second. Then we wait
     * until we've earned enough tokens so that the pool value has drifted at least for 2.5 tokens.
     * The default drift limit is 5 token (5% of 100 staked  tokens, see StreamrConfig.sol#poolValueDriftLimitFraction
     * in network-contracts), and the configured safe limit in this test is 50%, i.e. 2.5 tokens.
     */
    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                operatorsCutPercent: 10
            }
        })
        const sponsorer = await generateWalletWithGasAndTokens()
        const sponsorship = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship.address, 250)
        await delegate(operatorWallet, operatorContract.address, STAKE_AMOUNT)
        await stake(operatorContract, sponsorship.address, STAKE_AMOUNT)
        const helper = new MaintainOperatorPoolValueHelper({ ...operatorServiceConfig, signer: nodeWallets[0] })
        const driftLimitFraction = await helper.getDriftLimitFraction()
        const driftLimit = STAKE_AMOUNT * Number(driftLimitFraction) / ONE_ETHER
        const safeDriftLimit = driftLimit * SAFETY_FRACTION
        await waitForCondition(async () => {
            const unwithdrawnEarnings = Number(await getTotalUnwithdrawnEarnings(operatorContract)) / ONE_ETHER
            return unwithdrawnEarnings > safeDriftLimit
        }, 10000, 1000)
        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        await maintainOperatorPoolValue(
            BigInt(SAFETY_FRACTION * ONE_ETHER),
            driftLimitFraction,
            helper
        )
        // TODO do we know what the approximate pool value should be?
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())
    }, 60 * 1000)
})
