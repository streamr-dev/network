import { Methods } from '@streamr/test-utils'
import { EIP1271ContractFacade } from '../../../src/contracts/EIP1271ContractFacade'
import { EthereumAddress } from '@streamr/utils'

export class FakeEIP1271ContractFacade implements Methods<EIP1271ContractFacade> {
    // eslint-disable-next-line class-methods-use-this
    async isValidSignature(_contractAddress: EthereumAddress, _data: string, _signature: string): Promise<boolean> {
        throw new Error('not implemented')
    }
}
