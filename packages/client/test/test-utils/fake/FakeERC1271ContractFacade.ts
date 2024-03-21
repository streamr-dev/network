import { Methods } from '@streamr/test-utils'
import { ERC1271ContractFacade } from '../../../src/contracts/ERC1271ContractFacade'
import { EthereumAddress, recoverSignature, toEthereumAddress } from '@streamr/utils'
import { Promise } from 'ts-toolbelt/out/Any/Promise'
import { IERC1271 } from '../../../src/ethereumArtifacts/IERC1271'
import { FakeChain } from './FakeChain'
import { Lifecycle, scoped } from 'tsyringe'

@scoped(Lifecycle.ContainerScoped)
export class FakeERC1271ContractFacade implements Methods<ERC1271ContractFacade> {
    private readonly chain: FakeChain

    constructor(chain: FakeChain) {
        this.chain = chain
    }

    // eslint-disable-next-line class-methods-use-this
    async isValidSignature(contractAddress: EthereumAddress, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const clientWalletAddress = toEthereumAddress(recoverSignature(signature, payload))
        return this.chain.erc1271AllowedAddresses.has(contractAddress, clientWalletAddress)
    }

    // eslint-disable-next-line class-methods-use-this
    setInstantiateContracts(_instantiateContracts: (address: EthereumAddress) => IERC1271[]): void {
        throw new Error('Not implemented')
    }
}
