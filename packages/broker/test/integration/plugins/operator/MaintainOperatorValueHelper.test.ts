import { Wallet } from 'ethers'
import { Contract } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'

import { operatorFactoryABI, OperatorFactory } from '@streamr/network-contracts'
import { config } from '@streamr/config'

import { STREAMR_DOCKER_DEV_HOST } from '../../../utils'
import { setupOperatorContract, SetupOperatorOpts } from './setupOperatorContract'
import { getProvider } from './smartContractUtils'
import { MaintainOperatorValueHelper } from '../../../../src/plugins/operator/MaintainOperatorValueHelper'

const chainConfig = config.dev2
const theGraphUrl = `http://${STREAMR_DOCKER_DEV_HOST}:8800/subgraphs/name/streamr-dev/network-subgraphs`

const ADMIN_KEY = '0xb1abdb742d3924a45b0a54f780f0f21b9d9283b231a0a0b35ce5e455fa5375e7'

describe('MaintainOperatorValueHelper', () => {
    let provider: Provider
    let deployConfig: SetupOperatorOpts

    beforeAll(async () => {
        provider = getProvider()
        deployConfig = {
            provider,
            chainConfig,
            theGraphUrl,
            operatorConfig: {
                sharePercent: 10
            }
        }
    }, 60 * 1000)

    it('can find a random operator with getRandomOperator(), excluding himself', async () => {
        const { operatorContract, operatorConfig } = await setupOperatorContract(deployConfig)
        // deploy another operator to make sure there are at least 2 operators
        await setupOperatorContract(deployConfig)

        const helper = new MaintainOperatorValueHelper(operatorConfig)
        const randomOperatorAddress = await helper.getRandomOperator()
        expect(randomOperatorAddress).toBeDefined()

        // check it's a valid operator, deployed by the OperatorFactory
        const adminWallet = new Wallet(ADMIN_KEY, provider)
        const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, operatorFactoryABI, adminWallet) as unknown as OperatorFactory
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)).gt(0)
        expect(isDeployedByFactory).toBeTrue()
        // check it's not my operator
        expect(randomOperatorAddress).not.toEqual(operatorContract.address)
    }, 30 * 1000)
})
