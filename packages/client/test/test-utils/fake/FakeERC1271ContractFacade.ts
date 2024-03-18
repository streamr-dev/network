import { Methods } from '@streamr/test-utils'
import { ERC1271ContractFacade } from '../../../src/contracts/ERC1271ContractFacade'
import { EthereumAddress, recoverSignature, toEthereumAddress } from '@streamr/utils'
import { Promise } from 'ts-toolbelt/out/Any/Promise'
import { IERC1271 } from '../../../src/ethereumArtifacts/IERC1271'

export class FakeERC1271ContractFacade implements Methods<ERC1271ContractFacade> {

    private readonly allowedAddresses = new Map<EthereumAddress, Set<EthereumAddress>>

    // eslint-disable-next-line class-methods-use-this
    async isValidSignature(contractAddress: EthereumAddress, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const addresses = this.allowedAddresses.get(contractAddress)
        const clientWalletAddress = toEthereumAddress(recoverSignature(signature, payload))
        return addresses !== undefined && addresses.has(clientWalletAddress)
    }

    // eslint-disable-next-line class-methods-use-this
    setInstantiateContracts(_instantiateContracts: (address: EthereumAddress) => IERC1271[]): void {
        throw new Error('Not implemented')
    }

    addAllowedAddress(contractAddress: EthereumAddress, clientWalletAddresses: EthereumAddress): void {
        if (!this.allowedAddresses.has(contractAddress)) {
            this.allowedAddresses.set(contractAddress, new Set())
        }
        this.allowedAddresses.get(contractAddress)!.add(clientWalletAddresses)
    }
}
