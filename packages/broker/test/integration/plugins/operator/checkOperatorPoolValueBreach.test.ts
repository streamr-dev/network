import { Contract } from '@ethersproject/contracts'
import { parseEther } from '@ethersproject/units'
import { StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from '../../../../src/plugins/operator/MaintainOperatorPoolValueHelper'
import { checkOperatorPoolValueBreach } from '../../../../src/plugins/operator/checkOperatorPoolValueBreach'
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
import { getTotalUnwithdrawnEarnings } from './operatorPoolValueUtils'

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

describe('checkOperatorPoolValueBreach', () => {

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
        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const streamrConfigAddress = await operatorContract.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, getProvider()) as unknown as StreamrConfig
        const poolValueDriftLimitFraction = await streamrConfig.poolValueDriftLimitFraction()
        const allowedDifference = poolValueBeforeWithdraw.mul(poolValueDriftLimitFraction).div(ONE_ETHER).toBigInt()
        const helper = new MaintainOperatorPoolValueHelper({
            ...watcherConfig,
            signer: watcherOperatorWallet // TODO should be _watcherWallets[0] when ETH-579 deployed
        })
        // overwrite (for this test only) the getRandomOperator method to deterministically return the operator's address
        helper.getRandomOperator = async () => {
            return toEthereumAddress(operatorContract.address)
        }

        logger.debug('Waiting until above', { allowedDifference })
        await waitForCondition(async () => await getTotalUnwithdrawnEarnings(operatorContract) > allowedDifference, 10000, 1000)
        await checkOperatorPoolValueBreach(
            await helper.getDriftLimitFraction(),
            helper
        )

        const unwithdrawnEarnings = await getTotalUnwithdrawnEarnings(operatorContract)
        expect(unwithdrawnEarnings).toBeLessThan(allowedDifference)
        const poolValueAfterWithdraw = await operatorContract.getApproximatePoolValue()
        expect(poolValueAfterWithdraw.toBigInt()).toBeGreaterThan(poolValueBeforeWithdraw.toBigInt())

    }, 60 * 1000)
})
