import { Contract } from '@ethersproject/contracts'
import { parseEther } from '@ethersproject/units'
import { StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { OperatorValueBreachWatcher } from '../../../../src/plugins/operator/OperatorValueBreachWatcher'
import { createClient, createTestStream } from '../../../utils'
import {
    SetupOperatorContractOpts,
    delegate,
    deploySponsorshipContract,
    generateWalletWithGasAndTokens,
    getProvider,
    setupOperatorContract,
    sponsor,
    stake
} from './contractUtils'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

describe('OperatorValueBreachWatcher', () => {

    let streamId: string
    let deployConfig: SetupOperatorContractOpts

    beforeAll(async () => {
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
        deployConfig = {
            operatorConfig: {
                operatorsCutPercent: 10
            }
        }
    }, 60 * 1000)

    it('withdraws the other Operators earnings when they are above the penalty limit', async () => {
        // eslint-disable-next-line max-len
        const { operatorServiceConfig: watcherConfig, operatorWallet: watcherOperatorWallet, nodeWallets: _watcherWallets } = await setupOperatorContract({ nodeCount: 1, ...deployConfig })
        const { operatorWallet, operatorContract } = await setupOperatorContract(deployConfig)

        const sponsorer = await generateWalletWithGasAndTokens()
        await delegate(operatorWallet, operatorContract.address, 200)
        const sponsorship1 = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship1.address, 250)
        await stake(operatorContract, sponsorship1.address, 100)
        const sponsorship2 = await deploySponsorshipContract({ earningsPerSecond: parseEther('2'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship2.address, 250)
        await stake(operatorContract, sponsorship2.address, 100)

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher({
            ...watcherConfig,
            nodeWallet: watcherOperatorWallet // TODO should be _watcherWallets[0] when ETH-579 deployed
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
