import { BrandedString, EthereumAddress, hash, MapWithTtl, recoverSignerUserId, toUserId, UserID } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { RpcProviderSource } from '../RpcProviderSource'
import type { IERC1271 as ERC1271Contract } from '../ethereumArtifacts/IERC1271'
import ERC1271ContractArtifact from '../ethereumArtifacts/IERC1271Abi.json'
import { createLazyMap, Mapping } from '../utils/Mapping'
import { ContractFactory } from './ContractFactory'

export const SUCCESS_MAGIC_VALUE = '0x1626ba7e' // Magic value for success as defined by ERC-1271

export type CacheKey = BrandedString<string>

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function formCacheKey(contractAddress: EthereumAddress, signerUserId: UserID): CacheKey {
    return `${contractAddress}_${signerUserId}` as CacheKey
}

@scoped(Lifecycle.ContainerScoped)
export class ERC1271ContractFacade {
    private readonly contractsByAddress: Mapping<EthereumAddress, ERC1271Contract>
    private readonly publisherCache = new MapWithTtl<CacheKey, boolean>(() => CACHE_TTL)

    constructor(contractFactory: ContractFactory, rpcProviderSource: RpcProviderSource) {
        this.contractsByAddress = createLazyMap<EthereumAddress, ERC1271Contract>({
            valueFactory: async (address) => {
                return contractFactory.createReadContract(
                    address,
                    ERC1271ContractArtifact,
                    rpcProviderSource.getProvider(),
                    'erc1271Contract'
                ) as ERC1271Contract
            }
        })
    }

    async isValidSignature(
        contractAddress: EthereumAddress,
        payload: Uint8Array,
        signature: Uint8Array
    ): Promise<boolean> {
        const recoveredSignerUserId = toUserId(recoverSignerUserId(signature, payload))
        const cacheKey = formCacheKey(contractAddress, recoveredSignerUserId)
        const cachedValue = this.publisherCache.get(cacheKey)
        if (cachedValue !== undefined) {
            return cachedValue
        } else {
            const contract = await this.contractsByAddress.get(contractAddress)
            const result = await contract.isValidSignature(hash(payload), signature)
            const isValid = result === SUCCESS_MAGIC_VALUE
            this.publisherCache.set(cacheKey, isValid)
            return isValid
        }
    }
}
