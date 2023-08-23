import { parseEther } from '@ethersproject/units'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { Logger, waitForCondition } from '@streamr/utils'
import { MaintainOperatorValueService } from '../../../../src/plugins/operator/MaintainOperatorValueService'
import { createClient, createTestStream } from '../../../utils'
import { delegate, deploySponsorshipContract, setupOperatorContract, sponsor, stake } from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

const logger = new Logger(module)

describe('MaintainOperatorValueService', () => {

    let streamId: string

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(await fetchPrivateKeyWithGas())
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
    }, 60 * 1000)

    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, operatorConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1,
            operatorConfig: {
                sharePercent: 10
            }
        })

        await delegate(operatorWallet, operatorContract.address, 200)
        // TODO add a sponsorer and do the sponsor calls from that account?
        const sponsorship1 = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
        await sponsor(operatorWallet, sponsorship1.address, 250)
        await stake(operatorContract, sponsorship1.address, 100)
        const sponsorship2 = await deploySponsorshipContract({ earningsPerSecond: parseEther('2'), streamId, deployer: operatorWallet })
        await sponsor(operatorWallet, sponsorship2.address, 250)
        await stake(operatorContract, sponsorship2.address, 100)

        // 1000 = check every second
        const service = new MaintainOperatorValueService({
            ...operatorConfig,
            nodeWallet: nodeWallets[0]
        }, 0.5, 1000)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        await service.start()

        // wait until we see the withdraw happened: first we go above a sum (that must be < safe threshold), then below
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > parseEther('3').toBigInt(), 10000, 1000)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < parseEther('3').toBigInt(), 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await service.stop()
    }, 60 * 1000)
})
