import { ContractFactory } from '../ContractFactory'
import { getStreamRegistryChainProviders } from '../Ethereum'
import { Provider } from '@ethersproject/providers'
import { BrandedString, EthereumAddress, MapWithTtl, toEthereumAddress } from '@streamr/utils'
import ERC1271ContractArtifact from '../ethereumArtifacts/IERC1271Abi.json'
import type { IERC1271 as ERC1271Contract } from '../ethereumArtifacts/IERC1271'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { queryAllReadonlyContracts } from '../utils/contract'
import { Mapping } from '../utils/Mapping'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { recoverSignature, hash } from '@streamr/utils'

const SUCCESS_MAGIC_VALUE = '0x1626ba7e' // Magic value for success as defined by ERC-1271

export type CacheKey = BrandedString<string>

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function formKey(contractAddress: EthereumAddress, clientWalletAddress: EthereumAddress): CacheKey {
    return `${contractAddress}_${clientWalletAddress}` as CacheKey
}

@scoped(Lifecycle.ContainerScoped)
export class EIP1271ContractFacade {
    private readonly contractFactory: ContractFactory
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly contractsByAddress: Mapping<[EthereumAddress], ERC1271Contract[]>
    private readonly publisherCache = new MapWithTtl<CacheKey, boolean>(() => CACHE_TTL)
    private instantiateContracts: (address: EthereumAddress) => ERC1271Contract[] = (address) => {
        return getStreamRegistryChainProviders(this.config).map((provider: Provider) => {
            return this.contractFactory.createReadContract(
                address,
                ERC1271ContractArtifact,
                provider,
                'erc1271Contract'
            ) as ERC1271Contract
        })
    }

    constructor(
        contractFactory: ContractFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.contractFactory = contractFactory
        this.config = config
        this.contractsByAddress = new Mapping<[EthereumAddress], ERC1271Contract[]>(async (address) => {
            return this.instantiateContracts(address)
        })
    }

    // Testing use only
    setInstantiateContracts(instantiateContracts: (address: EthereumAddress) => ERC1271Contract[]): void {
        this.instantiateContracts = instantiateContracts
    }

    async isValidSignature(contractAddress: EthereumAddress, payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
        const clientWalletAddress = toEthereumAddress(recoverSignature(signature, payload))
        const cachedValue = this.publisherCache.get(formKey(contractAddress, clientWalletAddress))
        if (cachedValue !== undefined) {
            return cachedValue
        } else {
            const contracts = await this.contractsByAddress.get(contractAddress)
            const result = await queryAllReadonlyContracts((contract) => {
                return contract.isValidSignature(hash(payload), signature)
            }, contracts)
            const validSignature = result === SUCCESS_MAGIC_VALUE
            this.publisherCache.set(formKey(contractAddress, clientWalletAddress), validSignature)
            return validSignature
        }

    }
}
