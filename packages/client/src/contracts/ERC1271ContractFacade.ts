import { ContractFactory } from '../ContractFactory'
import { BrandedString, EthereumAddress, MapWithTtl, toEthereumAddress } from '@streamr/utils'
import ERC1271ContractArtifact from '../ethereumArtifacts/IERC1271Abi.json'
import type { IERC1271 as ERC1271Contract } from '../ethereumArtifacts/IERC1271'
import { queryAllReadonlyContracts } from '../utils/contract'
import { Mapping } from '../utils/Mapping'
import { Lifecycle, scoped } from 'tsyringe'
import { recoverAddress, hash } from '@streamr/utils'
import { RpcProviderFactory } from '../RpcProviderFactory'

export const SUCCESS_MAGIC_VALUE = '0x1626ba7e' // Magic value for success as defined by ERC-1271

export type CacheKey = BrandedString<string>

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function formCacheKey(contractAddress: EthereumAddress, clientWalletAddress: EthereumAddress): CacheKey {
    return `${contractAddress}_${clientWalletAddress}` as CacheKey
}

@scoped(Lifecycle.ContainerScoped)
export class ERC1271ContractFacade {
    private readonly contractsByAddress: Mapping<[EthereumAddress], ERC1271Contract[]>
    private readonly publisherCache = new MapWithTtl<CacheKey, boolean>(() => CACHE_TTL)

    constructor(
        contractFactory: ContractFactory,
        rpcProviderFactory: RpcProviderFactory
    ) {
        this.contractsByAddress = new Mapping<[EthereumAddress], ERC1271Contract[]>(async (address) => {
            return rpcProviderFactory.getProviders().map((provider) => {
                return contractFactory.createReadContract(
                    address,
                    ERC1271ContractArtifact,
                    provider,
                    'erc1271Contract'
                ) as ERC1271Contract
            })
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
