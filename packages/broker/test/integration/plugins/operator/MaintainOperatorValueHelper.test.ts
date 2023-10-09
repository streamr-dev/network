import { Contract } from '@ethersproject/contracts'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { OperatorFactory, operatorFactoryABI } from '@streamr/network-contracts'
import { SetupOperatorContractOpts, getAdminWallet, setupOperatorContract } from './contractUtils'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'

// TODO rename test file
describe('MaintainOperatorValueHelper', () => {

    let deployConfig: SetupOperatorContractOpts

    beforeAll(async () => {
        deployConfig = {
            operatorConfig: {
                operatorsCutPercent: 10
            }
        }
    }, 60 * 1000)

    it('can find a random operator with getRandomOperator(), excluding himself', async () => {
        const { operatorContract, operatorServiceConfig, nodeWallets } = await setupOperatorContract({ nodeCount: 1, ...deployConfig })
        // deploy another operator to make sure there are at least 2 operators
        await setupOperatorContract(deployConfig)

        const contractFacade = ContractFacade.createInstance({
            ...operatorServiceConfig,
            signer: nodeWallets[0]
        })
        const randomOperatorAddress = await contractFacade.getRandomOperator()
        expect(randomOperatorAddress).toBeDefined()

        // check it's a valid operator, deployed by the OperatorFactory
        const operatorFactory = new Contract(
            CHAIN_CONFIG.dev2.contracts.OperatorFactory,
            operatorFactoryABI, getAdminWallet()
        ) as unknown as OperatorFactory
        const isDeployedByFactory = (await operatorFactory.deploymentTimestamp(randomOperatorAddress!)).gt(0)
        expect(isDeployedByFactory).toBeTrue()
        // check it's not my operator
        expect(randomOperatorAddress).not.toEqual(operatorContract.address)
    }, 30 * 1000)
})
