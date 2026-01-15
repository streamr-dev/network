import { NodeRegistryABI, NodeRegistry as NodeRegistryContract } from '@streamr/network-contracts'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../ConfigTypes'
import { RpcProviderSource } from '../RpcProviderSource'
import { StreamrClientError } from '../StreamrClientError'
import { getEthersOverrides } from '../ethereumUtils'
import { ContractFactory } from './ContractFactory'
import { waitForTx } from './contract'

export interface StorageNodeMetadata {
    urls: string[]
}

/**
 * Store a mapping of storage node addresses <-> storage node URLs
 */
@scoped(Lifecycle.ContainerScoped)
export class StorageNodeRegistry {

    private nodeRegistryContract?: NodeRegistryContract
    private readonly nodeRegistryContractReadonly: NodeRegistryContract
    private readonly contractFactory: ContractFactory
    private readonly rpcProviderSource: RpcProviderSource
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private readonly identity: Identity

    constructor(
        contractFactory: ContractFactory,
        rpcProviderSource: RpcProviderSource,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>,
        @inject(IdentityInjectionToken) identity: Identity,
    ) {
        this.contractFactory = contractFactory
        this.rpcProviderSource = rpcProviderSource
        this.config = config
        this.identity = identity
        this.nodeRegistryContractReadonly = this.contractFactory.createReadContract(
            toEthereumAddress(this.config.contracts.storageNodeRegistryChainAddress),
            NodeRegistryABI,
            rpcProviderSource.getProvider(),
            'storageNodeRegistry'
        ) as NodeRegistryContract
    }

    private async connectToContract() {
        if (this.nodeRegistryContract === undefined) {
            const chainSigner = await this.identity.getTransactionSigner(this.rpcProviderSource)
            this.nodeRegistryContract = this.contractFactory.createWriteContract<NodeRegistryContract>(
                toEthereumAddress(this.config.contracts.storageNodeRegistryChainAddress),
                NodeRegistryABI,
                chainSigner,
                'storageNodeRegistry'
            )
        }
    }

    async setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        if (metadata !== undefined) {
            await waitForTx(this.nodeRegistryContract!.createOrUpdateNodeSelf(JSON.stringify(metadata), ethersOverrides))
        } else {
            await waitForTx(this.nodeRegistryContract!.removeNodeSelf(ethersOverrides))
        }
    }

    async getStorageNodeMetadata(nodeAddress: EthereumAddress): Promise<StorageNodeMetadata> {
        const [ resultNodeAddress, metadata ] = await this.nodeRegistryContractReadonly.getNode(nodeAddress)
        const NODE_NOT_FOUND = '0x0000000000000000000000000000000000000000'
        if (resultNodeAddress !== NODE_NOT_FOUND) {
            return JSON.parse(metadata)
        } else {
            throw new StreamrClientError('Node not found, id: ' + nodeAddress, 'NODE_NOT_FOUND')
        }
    }
}
