import { Contract } from '@ethersproject/contracts'
import { parseEther } from '@ethersproject/units'
import { Operator, StreamrConfig, streamrConfigABI } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { MaintainOperatorValueHelper } from '../../../../src/plugins/operator/MaintainOperatorValueHelper'
import { checkOperatorValueBreach } from '../../../../src/plugins/operator/checkOperatorValueBreach'
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

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

const getEarnings = async (operatorContract: Operator): Promise<bigint> => {
    const { earnings } = await operatorContract.getSponsorshipsAndEarnings()
    return earnings[0].toBigInt()
}

describe('checkOperatorValueBreach', () => {

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
        const { operatorServiceConfig: watcherConfig, nodeWallets: watcherWallets } = await setupOperatorContract({ nodeCount: 1, ...deployConfig })
        const { operatorWallet, operatorContract } = await setupOperatorContract(deployConfig)
        const sponsorer = await generateWalletWithGasAndTokens()
        await delegate(operatorWallet, operatorContract.address, 200)
        const sponsorship1 = await deploySponsorshipContract({ earningsPerSecond: parseEther('1'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship1.address, 250)
        await stake(operatorContract, sponsorship1.address, 100)
        const sponsorship2 = await deploySponsorshipContract({ earningsPerSecond: parseEther('2'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, sponsorship2.address, 250)
        await stake(operatorContract, sponsorship2.address, 100)
        const valueBeforeWithdraw = await operatorContract.valueWithoutEarnings()
        const streamrConfigAddress = await operatorContract.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, getProvider()) as unknown as StreamrConfig
        const driftLimitFraction = await streamrConfig.poolValueDriftLimitFraction()
        const allowedDifference = valueBeforeWithdraw.mul(driftLimitFraction).div(ONE_ETHER).toBigInt()
        const helper = new MaintainOperatorValueHelper({
            ...watcherConfig,
            signer: watcherWallets[0]
        })
        // overwrite (for this test only) the getRandomOperator method to deterministically return the operator's address
        helper.getRandomOperator = async () => {
            return toEthereumAddress(operatorContract.address)
        }

        logger.debug('Waiting until above', { allowedDifference })
        await waitForCondition(async () => await getEarnings(operatorContract) > allowedDifference, 10000, 1000)
        await checkOperatorValueBreach(
            helper
        )

        const earnings = await getEarnings(operatorContract)
        expect(earnings).toBeLessThan(allowedDifference)
        const valueAfterWithdraw = await operatorContract.valueWithoutEarnings()
        expect(valueAfterWithdraw.toBigInt()).toBeGreaterThan(valueBeforeWithdraw.toBigInt())

    }, 60 * 1000)
})
