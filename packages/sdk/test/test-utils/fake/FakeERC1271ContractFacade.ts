import { Methods } from '@streamr/test-utils'
import { ERC1271ContractFacade } from '../../../src/contracts/ERC1271ContractFacade'
import { binaryToHex, EthereumAddress, recoverAddress, toEthereumAddress } from '@streamr/utils'
// TODO: Why is eslint import rule complaining about this import?
// eslint-disable-next-line import/no-unresolved
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
        const clientWalletAddress = toEthereumAddress(binaryToHex(recoverAddress(signature, payload), true))
        return this.chain.hasErc1271AllowedAddress(contractAddress, clientWalletAddress)
    }

    // eslint-disable-next-line class-methods-use-this
    setInstantiateContracts(_instantiateContracts: (address: EthereumAddress) => IERC1271[]): void {
        throw new Error('Not implemented')
    }
}
