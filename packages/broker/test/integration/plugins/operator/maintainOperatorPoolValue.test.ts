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

    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, operatorServiceConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                operatorsCutPercent: 10
            }
        })
        const sponsorer = await generateWalletWithGasAndTokens()
        const sponsorship1 = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship1.address, 250)
        await delegate(operatorWallet, operatorContract.address, STAKE_AMOUNT)
        await stake(operatorContract, sponsorship1.address, STAKE_AMOUNT)
        const helper = new MaintainOperatorPoolValueHelper({ ...operatorServiceConfig, signer: nodeWallets[0] })
        const driftLimitFraction = await helper.getDriftLimitFraction() // 5% in Wei (see StreamrConfig.sol#poolValueDriftLimitFraction in network-contracts)
        // first we wait until there is enough accumulate earnings
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
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())
    }, 60 * 1000)
})
