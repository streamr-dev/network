import { fetchRedundancyFactor } from '../../../../src/plugins/operator/fetchRedundancyFactor'
import { getProvider, setupOperatorContract, SetupOperatorContractReturnType } from './contractUtils'
import { Contract, Wallet } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'

async function updateMetadata(deployment: SetupOperatorContractReturnType, metadata: string): Promise<void> {
    const operator = new Contract(
        deployment.operatorServiceConfig.operatorContractAddress,
        operatorABI,
        deployment.operatorWallet
    ) as unknown as Operator
    await (await operator.updateMetadata(metadata)).wait()
}

describe(fetchRedundancyFactor, () => {
    it('test (1) implicit, (2) explicit, (3) invalid, and (4) out-of-range', async () => {
        const deployment = await setupOperatorContract()
        const serviceConfig = {
            ...deployment.operatorServiceConfig,
            nodeWallet: Wallet.createRandom().connect(getProvider())
        }

        // implicit
        const factor = await fetchRedundancyFactor(serviceConfig)
        expect(factor).toEqual(1)

        // explicit
        await updateMetadata(deployment, JSON.stringify({ redundancyFactor: 5 }))
        const factor2 = await fetchRedundancyFactor(serviceConfig)
        expect(factor2).toEqual(5)

        // invalid
        await updateMetadata(deployment, 'notvalidjson')
        const factor3 = await fetchRedundancyFactor(serviceConfig)
        expect(factor3).toEqual(1)

        // out-of-range
        await updateMetadata(deployment, JSON.stringify({ redundancyFactor: 0 }))
        const factor4 = await fetchRedundancyFactor(serviceConfig)
        expect(factor4).toEqual(1)
    }, 30 * 1000)
})
