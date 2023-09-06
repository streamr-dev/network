import { parseEther } from '@ethersproject/units'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, waitForCondition } from '@streamr/utils'
import { MaintainOperatorValueService } from '../../../../src/plugins/operator/MaintainOperatorValueService'
import { createClient, createTestStream } from '../../../utils'
import { delegate, deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract, sponsor, stake } from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'
import { MaintainOperatorValueHelper } from '../../../../src/plugins/operator/MaintainOperatorValueHelper'
import { maintainOperatorValue } from '../../../../src/plugins/operator/maintainOperatorValue'

const logger = new Logger(module)

const ONE_ETHER = 1e18

describe('MaintainOperatorValueService', () => {

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
        await delegate(operatorWallet, operatorContract.address, 100)
        await stake(operatorContract, sponsorship1.address, 100)
        // first we wait until there is enough accumulate earnings (that must be < safe threshold),
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > parseEther('3').toBigInt(), 10000, 1000)
        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        const helper = new MaintainOperatorValueHelper({ ...operatorServiceConfig, signer: nodeWallets[0] }) 
        await maintainOperatorValue(
            BigInt(0.5 * ONE_ETHER), // 50%
            await helper.getDriftLimitFraction(),
            helper
        )
        // wait until we see the withdraw happened
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < parseEther('3').toBigInt(), 10000, 1000)
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())
    }, 60 * 1000)
})
