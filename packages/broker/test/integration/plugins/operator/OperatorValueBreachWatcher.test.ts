import { Contract } from '@ethersproject/contracts'
import { Provider, JsonRpcProvider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'

import { tokenABI, TestToken, StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { config } from '@streamr/config'

import { deploySponsorship } from './deploySponsorshipContract'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

import { OperatorValueBreachWatcher } from '../../../../src/plugins/operator/OperatorValueBreachWatcher'
import { STREAMR_DOCKER_DEV_HOST, createClient, createTestStream } from '../../../utils'
import { setupOperatorContract, SetupOperatorOpts } from './setupOperatorContract'

const chainConfig = config.dev2
const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8800/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

describe('OperatorValueBreachWatcher', () => {
    let provider: Provider
    let token: TestToken
    let streamId: string
    let deployConfig: SetupOperatorOpts

    beforeAll(async () => {
        provider = new JsonRpcProvider(`${chainConfig.rpcEndpoints[0].url}`)
        logger.debug('Connected to: ', await provider.getNetwork())

        logger.debug('Creating stream for the test')
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken
        deployConfig = {
            provider,
            chainConfig,
            theGraphUrl,
            operatorSettings: {
                operatorSharePercent: 10
            }
        }
    }, 60 * 1000)

    it('withdraws the other Operators earnings when they are above the penalty limit', async () => {
        const { operatorConfig: watcherConfig } = await setupOperatorContract(deployConfig)
        const { operatorWallet, operatorContract } = await setupOperatorContract(deployConfig)
        
        const sponsorship1 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('1') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther('250'), '0x')).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const sponsorship2 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('2') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther('250'), '0x')).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(watcherConfig)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const streamrConfigAddress = await operatorContract.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, provider) as unknown as StreamrConfig
        const poolValueDriftLimitFraction = await streamrConfig.poolValueDriftLimitFraction()
        const allowedDifference = poolValueBeforeWithdraw.mul(poolValueDriftLimitFraction).div(ONE_ETHER).toBigInt()
        
        // overwrite (for this test only) the getRandomOperator method to deterministically return the operator's address
        operatorValueBreachWatcher.helper.getRandomOperator = async () => {
            return toEthereumAddress(operatorContract.address)
        }

        logger.debug('Waiting until above', { allowedDifference })
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > allowedDifference, 10000, 1000)
        await operatorValueBreachWatcher.start()
        logger.debug('Waiting until below', { allowedDifference })
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) < allowedDifference, 10000, 1000)

        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

        await operatorValueBreachWatcher.stop()

    }, 60 * 1000)
})
