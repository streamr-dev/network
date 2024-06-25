import { fetchRedundancyFactor } from '../../../../src/plugins/operator/fetchRedundancyFactor'
import { getProvider, setupOperatorContract, SetupOperatorContractReturnType } from './contractUtils'
import { Contract } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts-ethers6'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { fastWallet } from '@streamr/test-utils'
import { SignerWithProvider } from '@streamr/sdk'

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
            signer: fastWallet().connect(getProvider()) as SignerWithProvider
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

    describe('no result cases', () => {
        it('invalid json', async () => {
            await updateMetadata(deployment, 'invalidjson')
            const factor = await fetchRedundancyFactor(serviceConfig)
            expect(factor).toBeUndefined()
        })

        it('valid json but missing field', async () => {
            await updateMetadata(deployment, JSON.stringify({ foo: 'bar' }))
            const factor = await fetchRedundancyFactor(serviceConfig)
            expect(factor).toBeUndefined()
        })

        it('valid json but invalid value', async () => {
            await updateMetadata(deployment, JSON.stringify({ redundancyFactor: 0 }))
            const factor = await fetchRedundancyFactor(serviceConfig)
            expect(factor).toBeUndefined()
        })
    })
})
