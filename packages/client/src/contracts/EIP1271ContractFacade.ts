import { ContractFactory } from '../ContractFactory'
import { getStreamRegistryChainProviders } from '../Ethereum'
import { Provider } from '@ethersproject/providers'
import { EthereumAddress } from '@streamr/utils'
import ERC1271ContractArtifact from '../ethereumArtifacts/IERC1271Abi.json'
import type { IERC1271 as ERC1271Contract } from '../ethereumArtifacts/IERC1271'
import { StrictStreamrClientConfig } from '../Config'
import { queryAllReadonlyContracts } from '../utils/contract'
import { Mapping } from '../utils/Mapping'
import { Lifecycle, scoped } from 'tsyringe'

const SUCCESS_MAGIC_VALUE = '0x1626ba7e' // Magic value for success as defined by ERC-1271

@scoped(Lifecycle.ContainerScoped)
export class EIP1271ContractFacade {
    private readonly contractsByAddress: Mapping<[EthereumAddress], ERC1271Contract[]>

    constructor(contractFactory: ContractFactory, config: Pick<StrictStreamrClientConfig, 'contracts'>) {
        this.contractsByAddress = new Mapping<[EthereumAddress], ERC1271Contract[]>(async (address) => {
            return getStreamRegistryChainProviders(config).map((provider: Provider) => {
                return contractFactory.createReadContract(
                    address,
                    ERC1271ContractArtifact,
                    provider,
                    'erc1271Contract'
                ) as ERC1271Contract
            })
        })
    }

    async isValidSignature(contractAddress: EthereumAddress, hash: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const contracts = await this.contractsByAddress.get(contractAddress)
        const result = await queryAllReadonlyContracts((contract) => {
            return contract.isValidSignature(hash, signature) // TODO: do we need to convert hash and signature to hex?
        }, contracts)
        return result === SUCCESS_MAGIC_VALUE
    }
}
