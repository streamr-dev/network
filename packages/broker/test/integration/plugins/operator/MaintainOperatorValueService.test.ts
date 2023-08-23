import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { Logger, waitForCondition } from '@streamr/utils'
import { MaintainOperatorValueService } from '../../../../src/plugins/operator/MaintainOperatorValueService'
import { createClient, createTestStream } from '../../../utils'
import { deploySponsorshipContract, getTokenContract, setupOperatorContract } from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

const chainConfig = CHAIN_CONFIG.dev2

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'

describe('MaintainOperatorValueService', () => {
    let streamId: string

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
    }, 60 * 1000)

    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, operatorConfig, nodeWallets } = await setupOperatorContract({
            nodeCount: 1,
            chainConfig,
            operatorConfig: {
                sharePercent: 10
            }
        })

        const sponsorship1 = await deploySponsorshipContract({ chainConfig, deployer: operatorWallet, streamId, earningsPerSecond: parseEther('1') })
        await (await getTokenContract().connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther('250'), '0x')).wait()
        // eslint-disable-next-line max-len
        await (await getTokenContract().connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const sponsorship2 = await deploySponsorshipContract({ chainConfig, deployer: operatorWallet, streamId, earningsPerSecond: parseEther('2') })
        await (await getTokenContract().connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther('250'), '0x')).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

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
