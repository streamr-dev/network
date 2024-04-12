import { ContractFactory } from '../ContractFactory'
import { getStreamRegistryChainProviders } from '../Ethereum'
import { Provider } from '@ethersproject/providers'
import { BrandedString, EthereumAddress, MapWithTtl, toEthereumAddress } from '@streamr/utils'
import ERC1271ContractArtifact from '../ethereumArtifacts/IERC1271Abi.json'
import type { IERC1271 as ERC1271Contract } from '../ethereumArtifacts/IERC1271'
import { StrictStreamrClientConfig } from '../Config'
import { queryAllReadonlyContracts } from '../utils/contract'
import { Mapping } from '../utils/Mapping'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { recoverAddress, hash } from '@streamr/utils'

export const SUCCESS_MAGIC_VALUE = '0x1626ba7e' // Magic value for success as defined by ERC-1271

export type CacheKey = BrandedString<string>

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function formCacheKey(contractAddress: EthereumAddress, clientWalletAddress: EthereumAddress): CacheKey {
    return `${contractAddress}_${clientWalletAddress}` as CacheKey
}

export const InstantiateERC1271ContractsToken = Symbol('InstantiateERC1271ContractsToken')

export function createNewInstantiateContractsFn(
    contractFactory: ContractFactory,
    config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
): (address: EthereumAddress) => ERC1271Contract[] {
    return (address) => getStreamRegistryChainProviders(config).map((provider: Provider) => {
        return contractFactory.createReadContract(
            address,
            ERC1271ContractArtifact,
            provider,
            'erc1271Contract'
        ) as ERC1271Contract
    })
}

@scoped(Lifecycle.ContainerScoped)
export class ERC1271ContractFacade {
    private readonly contractsByAddress: Mapping<[EthereumAddress], ERC1271Contract[]>
    private readonly publisherCache = new MapWithTtl<CacheKey, boolean>(() => CACHE_TTL)

    constructor(
        @inject(InstantiateERC1271ContractsToken) instantiateContracts: (address: EthereumAddress) => ERC1271Contract[],
    ) {
        this.contractsByAddress = new Mapping<[EthereumAddress], ERC1271Contract[]>(async (address) => {
            return instantiateContracts(address)
        })
    }

    async isValidSignature(contractAddress: EthereumAddress, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const clientWalletAddress = toEthereumAddress(recoverAddress(signature, payload))
        const cacheKey = formCacheKey(contractAddress, clientWalletAddress)
        const cachedValue = this.publisherCache.get(cacheKey)
        if (cachedValue !== undefined) {
            return cachedValue
        } else {
            const contracts = await this.contractsByAddress.get(contractAddress)
            const result = await queryAllReadonlyContracts((contract) => {
                return contract.isValidSignature(hash(payload), signature)
            }, contracts)
            const isValid = result === SUCCESS_MAGIC_VALUE
            this.publisherCache.set(cacheKey, isValid)
            return isValid
        }

    }
}
