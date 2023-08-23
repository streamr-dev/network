import { Contract } from '@ethersproject/contracts'
import { parseEther } from '@ethersproject/units'
import { StreamrConfig, TestToken, streamrConfigABI } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { OperatorValueBreachWatcher } from '../../../../src/plugins/operator/OperatorValueBreachWatcher'
import { createClient, createTestStream } from '../../../utils'
import { SetupOperatorContractOpts, deploySponsorshipContract, getProvider, getTokenContract, setupOperatorContract } from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

describe('OperatorValueBreachWatcher', () => {
    let token: TestToken
    let streamId: string
    let deployConfig: SetupOperatorContractOpts

    beforeAll(async () => {
        logger.debug('Creating stream for the test')
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
        deployConfig = {
            operatorConfig: {
                sharePercent: 10
            }
        }
        token = getTokenContract()
    }, 60 * 1000)

    it('withdraws the other Operators earnings when they are above the penalty limit', async () => {
        const { operatorConfig: watcherConfig, nodeWallets: watcherWallets } = await setupOperatorContract({ nodeCount: 1, ...deployConfig })
        const { operatorWallet, operatorContract } = await setupOperatorContract(deployConfig)
        
        const sponsorship1 = await deploySponsorshipContract({ deployer: operatorWallet, streamId, earningsPerSecond: parseEther('1') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther('250'), '0x')).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const sponsorship2 = await deploySponsorshipContract({ deployer: operatorWallet, streamId, earningsPerSecond: parseEther('2') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther('250'), '0x')).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher({
            ...watcherConfig,
            nodeWallet: watcherWallets[0]
        })

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const streamrConfigAddress = await operatorContract.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, getProvider()) as unknown as StreamrConfig
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
