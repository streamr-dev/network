import {
    fetchRedundancyFactor,
    RedundancyFactorParseError
} from '../../../../src/plugins/operator/fetchRedundancyFactor'
import { getProvider, setupOperatorContract, SetupOperatorContractReturnType } from './contractUtils'
import { Contract, Wallet } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'

async function updateMetadata(deployment: SetupOperatorContractReturnType, metadata: string): Promise<void> {
    const operator = new Contract(
        deployment.operatorServiceConfig.operatorContractAddress,
        operatorABI,
        deployment.operatorWallet
    ) as unknown as Operator
    await (await operator.updateMetadata(metadata)).wait()
}

describe(fetchRedundancyFactor, () => {
    let deployment: SetupOperatorContractReturnType
    let serviceConfig: OperatorServiceConfig

    beforeAll(async () => {
        deployment = await setupOperatorContract()
        serviceConfig = {
            ...deployment.operatorServiceConfig,
            nodeWallet: Wallet.createRandom().connect(getProvider())
        }
    }, 30 * 1000)

    describe('happy paths', () => {
        it('empty metadata', async () => {
            await updateMetadata(deployment, '')
            const factor = await fetchRedundancyFactor(serviceConfig)
            expect(factor).toEqual(1)
        })

        it('explicit valid metadata', async () => {
            await updateMetadata(deployment, JSON.stringify({ redundancyFactor: 6 }))
            const factor = await fetchRedundancyFactor(serviceConfig)
            expect(factor).toEqual(6)
        })
    })

    describe('error cases', () => {
        it('invalid json', async () => {
            await updateMetadata(deployment, 'invalidjson')
            await expect(fetchRedundancyFactor(serviceConfig)).rejects.toThrowError(RedundancyFactorParseError)
        })

        it('valid json but missing field', async () => {
            await updateMetadata(deployment, JSON.stringify({ foo: 'bar' }))
            await expect(fetchRedundancyFactor(serviceConfig)).rejects.toThrowError(RedundancyFactorParseError)
        })

        it('valid json but invalid value', async () => {
            await updateMetadata(deployment, JSON.stringify({ redundancyFactor: 0 }))
            await expect(fetchRedundancyFactor(serviceConfig)).rejects.toThrowError(RedundancyFactorParseError)
        })
    })
})
