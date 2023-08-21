import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'

import { TestToken, tokenABI } from '@streamr/network-contracts'
import { Logger, waitForCondition } from '@streamr/utils'
import { config as CHAIN_CONFIG } from '@streamr/config'

import { deploySponsorship } from './deploySponsorshipContract'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

import { STREAMR_DOCKER_DEV_HOST, createClient, createTestStream } from '../../../utils'
import { MaintainOperatorValueService } from '../../../../src/plugins/operator/MaintainOperatorValueService'
import { setupOperatorContract } from './setupOperatorContract'

const chainConfig = CHAIN_CONFIG.dev2

const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8800/subgraphs/name/streamr-dev/network-subgraphs`
const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'

describe('MaintainOperatorValueService', () => {
    let provider: Provider
    let token: TestToken
    let streamId: string

    beforeAll(async () => {
        provider = new JsonRpcProvider(`${chainConfig.rpcEndpoints[0].url}`)
        logger.debug('Connected to: ', await provider.getNetwork())

        logger.debug('Creating stream for the test')
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken
    }, 60 * 1000)

    it('withdraws sponsorship earnings when earnings are above the safe threshold', async () => {
        const { operatorWallet, operatorContract, operatorConfig } = await setupOperatorContract({
            provider,
            chainConfig,
            theGraphUrl,
            operatorSettings: {
                operatorSharePercent: 10
            }
        })

        const sponsorship1 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('1') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther('250'), '0x')).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const sponsorship2 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('2') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther('250'), '0x')).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

        // 1000 = check every second
        const service = new MaintainOperatorValueService(operatorConfig, 0.5, 1000)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()

        // 5 DATA = 50% of 10 DATA, 50% is the "safe threshold" (we don't want to wait all the way to the limit, lest we be late)
        // 10 DATA = 10% of 100 DATA, 10% is the penalty limit (sum of unwithdrawn earnings may not exceed it)
        // 100 DATA = pool value
        await service.start()

        // wait until we see the withdraw happened: first we go above a sum (that must be < safe threshold), then below
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > parseEther('3').toBigInt(), 10000, 1000)
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < parseEther('3').toBigInt(), 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await service.stop()
    }, 60 * 1000)
})
