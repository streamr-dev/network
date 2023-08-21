import { Wallet } from 'ethers'
import { Contract } from '@ethersproject/contracts'
import { Provider, JsonRpcProvider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'

import { tokenABI, TestToken, operatorFactoryABI, OperatorFactory } from '@streamr/network-contracts'
import { Logger, toEthereumAddress, waitForCondition } from '@streamr/utils'
import { config } from '@streamr/config'

import { deployOperatorContract } from './deployOperatorContract'
import { deploySponsorship } from './deploySponsorshipContract'
import { getTotalUnwithdrawnEarnings } from './operatorValueUtils'
import { generateWalletWithGasAndTokens } from './smartContractUtils'

import { OperatorValueBreachWatcher } from '../../../../src/plugins/operator/OperatorValueBreachWatcher'
import { STREAMR_DOCKER_DEV_HOST, createClient, createTestStream } from '../../../utils'

const chainConfig = config.dev2
const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8800/subgraphs/name/streamr-dev/network-subgraphs`

const logger = new Logger(module)

const STREAM_CREATION_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'

describe('OperatorValueBreachWatcher', () => {
    let provider: Provider
    let token: TestToken
    let streamId: string

    const deployNewOperator = async () => {
        const operatorWallet = await generateWalletWithGasAndTokens(provider, chainConfig)
        logger.debug('Deploying operator contract')
        const operatorContract = await deployOperatorContract(chainConfig, operatorWallet, { operatorSharePercent: 10 })
        logger.debug(`Operator deployed at ${operatorContract.address}`)
        const operatorConfig = {
            operatorContractAddress: toEthereumAddress(operatorContract.address),
            provider,
            theGraphUrl,
            signer: operatorWallet,
            maxSponsorshipsInWithdraw: 20,
            minSponsorshipEarningsInWithdraw: 1 // full tokens
        }
        return { operatorWallet, operatorContract, operatorConfig }
    }

    beforeAll(async () => {
        provider = new JsonRpcProvider(`${chainConfig.rpcEndpoints[0].url}`)
        logger.debug('Connected to: ', await provider.getNetwork())

        logger.debug('Creating stream for the test')
        const client = createClient(STREAM_CREATION_KEY)
        streamId = (await createTestStream(client, module)).id
        await client.destroy()

        token = new Contract(chainConfig.contracts.DATA, tokenABI) as unknown as TestToken
    }, 60 * 1000)

    it('can find a random operator, excluding himself', async () => {
        const { operatorContract, operatorConfig } = await deployNewOperator()
        // deploy another operator to make sure there are at least 2 operators
        await deployNewOperator()

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(operatorConfig)
        const randomOperatorAddress = await operatorValueBreachWatcher.helper.getRandomOperator()
        if (randomOperatorAddress === undefined) {
            throw new Error('No random operator found')
        }
        // check it's a valid operator, deployed by the OperatorFactory
        const adminWallet = new Wallet(STREAM_CREATION_KEY, provider)
        const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, operatorFactoryABI, adminWallet) as unknown as OperatorFactory
        const isDeployedByFactory = await operatorFactory.deploymentTimestamp(randomOperatorAddress)
        expect(isDeployedByFactory).not.toEqual(0)
        // check it's not my operator
        expect(randomOperatorAddress).not.toEqual(operatorContract.address)
    })

    it('withdraws the other Operators earnings when they are above the penalty limit', async () => {
        const { operatorConfig: watcherConfig } = await deployNewOperator()
        const { operatorWallet, operatorContract } = await deployNewOperator()
        
        const sponsorship1 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('1') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship1.address, parseEther('250'), '0x')).wait()
        await (await token.connect(operatorWallet).transferAndCall(operatorContract.address, parseEther('200'), operatorWallet.address)).wait()
        await (await operatorContract.stake(sponsorship1.address, parseEther('100'))).wait()

        const sponsorship2 = await deploySponsorship(chainConfig, operatorWallet, { streamId, earningsPerSecond: parseEther('2') })
        await (await token.connect(operatorWallet).transferAndCall(sponsorship2.address, parseEther('250'), '0x')).wait()
        await (await operatorContract.stake(sponsorship2.address, parseEther('100'))).wait()

        const operatorValueBreachWatcher = new OperatorValueBreachWatcher(watcherConfig)

        const poolValueBeforeWithdraw = await operatorContract.getApproximatePoolValue()
        const allowedDifference = poolValueBeforeWithdraw.div('10').toBigInt()

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
