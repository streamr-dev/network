import { Contract } from '@ethersproject/contracts'
import debug from 'debug'
import type { NodeRegistry as NodeRegistryContract } from '../ethereumArtifacts/NodeRegistry'
import NodeRegistryArtifact from '../ethereumArtifacts/NodeRegistryAbi.json'
import { scoped, Lifecycle, inject } from 'tsyringe'
import { ConfigInjectionToken } from '../Config'
import { EthereumConfig, getStreamRegistryChainProvider, getStreamRegistryOverrides } from '../Ethereum'
import { NotFoundError } from '../HttpUtil'
import { EthereumAddress } from 'streamr-client-protocol'
import { waitForTx, withErrorHandlingAndLogging } from '../utils/contract'
import { SynchronizedGraphQLClient, createWriteContract } from '../utils/SynchronizedGraphQLClient'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'

/**
 * Store a mapping of storage node addresses <-> storage node URLs
 */

const log = debug('StreamrClient:StorageNodeRegistry')

export interface StorageNodeMetadata {
    http: string
}

@scoped(Lifecycle.ContainerScoped)
export class StorageNodeRegistry {

    private nodeRegistryContract?: NodeRegistryContract
    private nodeRegistryContractReadonly: NodeRegistryContract

    constructor(
        @inject(SynchronizedGraphQLClient) private graphQLClient: SynchronizedGraphQLClient,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Ethereum) private ethereumConfig: EthereumConfig,
    ) {
        const chainProvider = getStreamRegistryChainProvider(ethereumConfig)
        this.nodeRegistryContractReadonly = withErrorHandlingAndLogging(
            new Contract(this.ethereumConfig.storageNodeRegistryChainAddress, NodeRegistryArtifact, chainProvider),
            'storageNodeRegistry'
        ) as NodeRegistryContract
    }

    private async connectToContract() {
        if (!this.nodeRegistryContract) {
            const chainSigner = await this.authentication.getStreamRegistryChainSigner()
            this.nodeRegistryContract = createWriteContract<NodeRegistryContract>(
                this.ethereumConfig.storageNodeRegistryChainAddress,
                NodeRegistryArtifact,
                chainSigner,
                'storageNodeRegistry',
                this.graphQLClient
            )
        }
    }

    async setStorageNodeMetadata(metadata: StorageNodeMetadata | undefined): Promise<void> {
        log('setStorageNodeMetadata %j', metadata)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
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
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
    }
}
