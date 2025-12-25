import { Operator, StreamrConfig, StreamrConfigABI } from '@streamr/network-contracts'
import { _operatorContractUtils } from '@streamr/sdk'
import { createTestWallet, getTestProvider, setupTestOperatorContract, setupTestOperatorContractOpts } from '@streamr/test-utils'
import { Logger, toEthereumAddress, until } from '@streamr/utils'
import { Contract, parseEther } from 'ethers'
import { checkOperatorValueBreach } from '../../../../src/plugins/operator/checkOperatorValueBreach'
import { createClient, createTestStream, deployTestOperatorContract, deployTestSponsorshipContract } from '../../../utils'

const {
    delegate,
    sponsor,
    stake,
    getOperatorContract
} = _operatorContractUtils

const logger = new Logger('checkOperatorValueBreach.test')

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'
const ONE_ETHER = BigInt(1e18)

const getEarnings = async (operatorContract: Operator): Promise<bigint> => {
    const { earnings } = await operatorContract.getSponsorshipsAndEarnings()
    return earnings[0]
}

describe('checkOperatorValueBreach', () => {

    let streamId: string
    let deployConfig: setupTestOperatorContractOpts

    beforeAll(async () => {
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()
        deployConfig = {
            operatorConfig: {
                operatorsCutPercentage: 10
            },
            deployTestOperatorContract
        }
    }, 60 * 1000)

    it('withdraws the other Operators earnings when they are above the limit', async () => {
        // eslint-disable-next-line max-len
        const { operatorContractAddress: watcherOperatorContractAddress, nodeWallets: watcherWallets } = await setupTestOperatorContract({ nodeCount: 1, ...deployConfig })
        const { operatorWallet, operatorContractAddress } = await setupTestOperatorContract(deployConfig)
        const sponsorer = await createTestWallet({ gas: true, tokens: true })
        await delegate(operatorWallet, operatorContractAddress, parseEther('20000'))
        const sponsorship1 = await deployTestSponsorshipContract({ earningsPerSecond: parseEther('100'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, await sponsorship1.getAddress(), parseEther('25000'))
        await stake(operatorWallet, operatorContractAddress, await sponsorship1.getAddress(), parseEther('10000'))
        const sponsorship2 = await deployTestSponsorshipContract({ earningsPerSecond: parseEther('200'), streamId, deployer: operatorWallet })
        await sponsor(sponsorer, await sponsorship2.getAddress(), parseEther('25000'))
        await stake(operatorWallet, operatorContractAddress, await sponsorship2.getAddress(), parseEther('10000'))
        const operatorContract = getOperatorContract(operatorContractAddress).connect(operatorWallet)
        const valueBeforeWithdraw = await operatorContract.valueWithoutEarnings()
        const streamrConfigAddress = await operatorContract.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, StreamrConfigABI, getTestProvider()) as unknown as StreamrConfig
        const allowedDifference = valueBeforeWithdraw * (await streamrConfig.maxAllowedEarningsFraction()) / ONE_ETHER
        const client = createClient(watcherWallets[0].privateKey)
        const operator = client.getOperator(toEthereumAddress(watcherOperatorContractAddress))

        logger.debug('Waiting until above', { allowedDifference })
        await until(async () => await getEarnings(operatorContract) > allowedDifference, 10000, 1000)
        await checkOperatorValueBreach(operator, client, async () => {
            return [toEthereumAddress(operatorContractAddress)]
        }, 1n, 20)

        const earnings = await getEarnings(operatorContract)
        expect(earnings).toBeLessThan(allowedDifference)
        const valueAfterWithdraw = await operatorContract.valueWithoutEarnings()
        expect(valueAfterWithdraw).toBeGreaterThan(valueBeforeWithdraw)

    }, 60 * 1000)
})
