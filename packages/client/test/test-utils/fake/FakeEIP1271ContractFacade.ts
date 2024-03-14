import { Methods } from '@streamr/test-utils'
import { EIP1271ContractFacade } from '../../../src/contracts/EIP1271ContractFacade'
import { EthereumAddress } from '@streamr/utils'
import { Promise } from 'ts-toolbelt/out/Any/Promise'
import { IERC1271 } from '../../../src/ethereumArtifacts/IERC1271'

export class FakeEIP1271ContractFacade implements Methods<EIP1271ContractFacade> {
    // eslint-disable-next-line class-methods-use-this
    async isValidSignature(_contractAddress: EthereumAddress, _payload: Uint8Array, _signature: Uint8Array): Promise<boolean> {
        throw new Error('Not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    setInstantiateContracts(_instantiateContracts: (address: EthereumAddress) => IERC1271[]): void {
        throw new Error('Not implemented')
    }
}
