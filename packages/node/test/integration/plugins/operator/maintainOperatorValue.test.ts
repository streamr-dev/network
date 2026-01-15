import { _operatorContractUtils } from '@streamr/sdk'
import { createTestPrivateKey, createTestWallet, setupTestOperatorContract } from '@streamr/test-utils'
import { Logger, multiplyWeiAmount, toEthereumAddress, until } from '@streamr/utils'
import { parseEther } from 'ethers'
import { maintainOperatorValue } from '../../../../src/plugins/operator/maintainOperatorValue'
import { createClient, createTestStream, deployTestOperatorContract, deployTestSponsorshipContract } from '../../../utils'

const {
    delegate,
    sponsor,
    stake,
    getOperatorContract
} = _operatorContractUtils

const logger = new Logger('maintainOperatorValue.test')

const STAKE_AMOUNT = parseEther('10000')
const SAFETY_FRACTION = 0.5  // 50%

describe('maintainOperatorValue', () => {

    let streamId: string

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(await createTestPrivateKey({ gas: true }))
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
        const { operatorWallet, operatorContractAddress, nodeWallets } = await setupTestOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                operatorsCutPercentage: 10
            },
            deployTestOperatorContract
        })
        const sponsorer = await createTestWallet({ gas: true, tokens: true })
        const sponsorship = await deployTestSponsorshipContract({ earningsPerSecond: parseEther('100'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, await sponsorship.getAddress(), parseEther('25000'))
        await delegate(operatorWallet, operatorContractAddress, STAKE_AMOUNT)
        await stake(operatorWallet, operatorContractAddress, await sponsorship.getAddress(), STAKE_AMOUNT)
        const operator = createClient(nodeWallets[0].privateKey).getOperator(toEthereumAddress(operatorContractAddress))
        const { maxAllowedEarnings } = await operator.getEarnings(1n, 20)
        const triggerWithdrawLimit = multiplyWeiAmount(maxAllowedEarnings, 1 - SAFETY_FRACTION)
        await until(async () => {
            const { sum } = await operator.getEarnings(1n, 20)
            return sum > triggerWithdrawLimit
        }, 10000, 1000)
        const operatorContract = getOperatorContract(operatorContractAddress).connect(operatorWallet)
        const valueBeforeWithdraw = await operatorContract.valueWithoutEarnings()

        await maintainOperatorValue(
            SAFETY_FRACTION,
            1n,
            20,
            operator
        )
        const valueAfterWithdraw = await operatorContract.valueWithoutEarnings()
        expect(valueAfterWithdraw).toBeGreaterThan(valueBeforeWithdraw)
    }, 60 * 1000)
})
