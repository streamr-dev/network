import { Provider } from 'ethers'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { ContractFactory } from '../ContractFactory'
import { getEthersOverrides } from '../ethereumUtils'
import { StreamrClientError } from '../StreamrClientError'
import type { NodeRegistry as NodeRegistryContract } from '../ethereumArtifacts/NodeRegistry'
import NodeRegistryArtifact from '../ethereumArtifacts/NodeRegistryAbi.json'
import { queryAllReadonlyContracts, waitForTx } from '../utils/contract'
import { RpcProviderFactory } from '../RpcProviderFactory'
import { SignerSource } from '../SignerSource'

export interface StorageNodeMetadata {
    urls: string[]
}

/**
 * Store a mapping of storage node addresses <-> storage node URLs
 */
@scoped(Lifecycle.ContainerScoped)
export class StorageNodeRegistry {

    private nodeRegistryContract?: NodeRegistryContract
    private readonly nodeRegistryContractsReadonly: NodeRegistryContract[]
    private readonly contractFactory: ContractFactory
    private readonly rpcProviderFactory: RpcProviderFactory
    private readonly signerSource: SignerSource
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>

    constructor(
        contractFactory: ContractFactory,
        rpcProviderFactory: RpcProviderFactory,
        signerSource: SignerSource,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    ) {
        this.contractFactory = contractFactory
        this.rpcProviderFactory = rpcProviderFactory
        this.signerSource = signerSource
        this.config = config
        this.nodeRegistryContractsReadonly = rpcProviderFactory.getProviders().map((provider: Provider) => {
            return this.contractFactory.createReadContract(
                toEthereumAddress(this.config.contracts.storageNodeRegistryChainAddress),
                NodeRegistryArtifact,
                provider,
                'storageNodeRegistry'
            ) as NodeRegistryContract
        })
    }

    private async connectToContract() {
        if (!this.nodeRegistryContract) {
            const chainSigner = await this.signerSource.getSigner()
            this.nodeRegistryContract = this.contractFactory.createWriteContract<NodeRegistryContract>(
                toEthereumAddress(this.config.contracts.storageNodeRegistryChainAddress),
                NodeRegistryArtifact,
                chainSigner,
                'storageNodeRegistry'
            )
        }
    }

    async setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderFactory, this.config)
        if (metadata !== undefined) {
            await waitForTx(this.nodeRegistryContract!.createOrUpdateNodeSelf(JSON.stringify(metadata), ethersOverrides))
        } else {
            await waitForTx(this.nodeRegistryContract!.removeNodeSelf(ethersOverrides))
        }
    }

    async getStorageNodeMetadata(nodeAddress: EthereumAddress): Promise<StorageNodeMetadata> {
        const [ resultNodeAddress, metadata ] = await queryAllReadonlyContracts<any, NodeRegistryContract>((contract) => {
            return contract.getNode(nodeAddress)
        }, this.nodeRegistryContractsReadonly)
        const NODE_NOT_FOUND = '0x0000000000000000000000000000000000000000'
        if (resultNodeAddress !== NODE_NOT_FOUND) {
            return JSON.parse(metadata)
        } else {
            throw new StreamrClientError('Node not found, id: ' + nodeAddress, 'NODE_NOT_FOUND')
        }
    }
}
