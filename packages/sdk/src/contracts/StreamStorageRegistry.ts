import { EthereumAddress, Logger, StreamID, TheGraphClient, collect, toEthereumAddress, toStreamID } from '@streamr/utils'
import { Interface } from 'ethers'
import min from 'lodash/min'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { RpcProviderSource } from '../RpcProviderSource'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamMetadata, parseMetadata } from '../StreamMetadata'
import type { StreamStorageRegistryV2 as StreamStorageRegistryContract } from '../ethereumArtifacts/StreamStorageRegistryV2'
import StreamStorageRegistryArtifact from '../ethereumArtifacts/StreamStorageRegistryV2Abi.json'
import { getEthersOverrides } from '../ethereumUtils'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Mapping, createCacheMap } from '../utils/Mapping'
import { ChainEventPoller } from './ChainEventPoller'
import { ContractFactory } from './ContractFactory'
import { initContractEventGateway, waitForTx } from './contract'

export interface StorageNodeAssignmentEvent {
    readonly streamId: StreamID
    readonly nodeAddress: EthereumAddress
    readonly blockNumber: number
}

interface NodeQueryResult {
    id: string
    metadata: string
    lastseen: string
}

const GET_ALL_STORAGE_NODES = Symbol('GET_ALL_STORAGE_NODES')

/**
 * Stores storage node assignments (mapping of streamIds <-> storage nodes addresses)
 */
@scoped(Lifecycle.ContainerScoped)
export class StreamStorageRegistry {

    private streamStorageRegistryContract?: StreamStorageRegistryContract
    private readonly streamStorageRegistryContractReadonly: StreamStorageRegistryContract
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly contractFactory: ContractFactory
    private readonly rpcProviderSource: RpcProviderSource
    private readonly theGraphClient: TheGraphClient
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private readonly authentication: Authentication
    private readonly logger: Logger
    private readonly storageNodesCache: Mapping<StreamID | typeof GET_ALL_STORAGE_NODES, EthereumAddress[]>

    constructor(
        streamIdBuilder: StreamIDBuilder,
        contractFactory: ContractFactory,
        rpcProviderSource: RpcProviderSource,
        chainEventPoller: ChainEventPoller,
        theGraphClient: TheGraphClient,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'cache' | '_timeouts'>,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.contractFactory = contractFactory
        this.rpcProviderSource = rpcProviderSource
        this.theGraphClient = theGraphClient
        this.config = config
        this.authentication = authentication
        this.logger = loggerFactory.createLogger(module)
        this.streamStorageRegistryContractReadonly = this.contractFactory.createReadContract(
            toEthereumAddress(this.config.contracts.streamStorageRegistryChainAddress),
            StreamStorageRegistryArtifact,
            rpcProviderSource.getProvider(),
            'streamStorageRegistry'
        ) as StreamStorageRegistryContract
        this.initStreamAssignmentEventListeners(eventEmitter, chainEventPoller, loggerFactory)
        this.storageNodesCache = createCacheMap({
            valueFactory: (query) => {
                return this.getStorageNodes_nonCached(query)
            },
            ...config.cache
        })
    }

    private initStreamAssignmentEventListeners(
        eventEmitter: StreamrClientEventEmitter,
        chainEventPoller: ChainEventPoller,
        loggerFactory: LoggerFactory
    ) {
        const transformation = (streamId: string, nodeAddress: string, blockNumber: number) => ({
            streamId: toStreamID(streamId),
            nodeAddress: toEthereumAddress(nodeAddress),
            blockNumber
        })
        const contractAddress = toEthereumAddress(this.config.contracts.streamStorageRegistryChainAddress)
        const contractInterface = new Interface(StreamStorageRegistryArtifact)
        initContractEventGateway({
            sourceDefinition: {
                contractInterfaceFragment: contractInterface.getEvent('Added')!,
                contractAddress
            },
            sourceEmitter: chainEventPoller,
            targetName: 'streamAddedToStorageNode',
            targetEmitter: eventEmitter,
            transformation,
            loggerFactory
        })
        initContractEventGateway({
            sourceDefinition: {
                contractInterfaceFragment: contractInterface.getEvent('Removed')!,
                contractAddress
            },
            sourceEmitter: chainEventPoller,
            targetName: 'streamRemovedFromStorageNode',
            targetEmitter: eventEmitter,
            transformation,
            loggerFactory
        })
    }

    private async connectToContract() {
        if (!this.streamStorageRegistryContract) {
            const chainSigner = await this.authentication.getTransactionSigner(this.rpcProviderSource)
            this.streamStorageRegistryContract = this.contractFactory.createWriteContract<StreamStorageRegistryContract>(
                toEthereumAddress(this.config.contracts.streamStorageRegistryChainAddress),
                StreamStorageRegistryArtifact,
                chainSigner,
                'streamStorageRegistry'
            )
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Add stream to storage node', { streamId, nodeAddress })
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        await waitForTx(this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress, ethersOverrides))
        this.storageNodesCache.invalidate((key) => key === streamId)
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Remove stream from storage node', { streamId, nodeAddress })
        await this.connectToContract()
        const ethersOverrides = await getEthersOverrides(this.rpcProviderSource, this.config)
        await waitForTx(this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress, ethersOverrides))
        this.storageNodesCache.invalidate((key) => key === streamId)
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Check if stream is stored in storage node', { streamId, nodeAddress })
        return await this.streamStorageRegistryContractReadonly.isStorageNodeOf(streamId, nodeAddress)
    }

    async getStoredStreams(nodeAddress: EthereumAddress): Promise<{ streams: { id: StreamID, metadata: StreamMetadata }[], blockNumber: number }> {
        this.logger.debug('Get stored streams of storage node', { nodeAddress })
        const blockNumbers: number[] = []
        const res = await collect(this.theGraphClient.queryEntities(
            (lastId: string, pageSize: number) => {
                const query = `{
                    node (id: "${nodeAddress}") {
                        id
                        metadata
                        lastSeen
                        storedStreams (first: ${pageSize} orderBy: "id" where: { id_gt: "${lastId}"}) {
                            id,
                            metadata
                        }
                    }
                    _meta {
                        block {
                            number
                        }
                    }
                }`
                return { query }
            },
            (response: any) => {
                // eslint-disable-next-line no-underscore-dangle
                blockNumbers.push(response._meta.block.number)
                return (response.node !== null) ? response.node.storedStreams : []
            }
        ))
        const streams = res.map((stream: any) => {
            return { id: toStreamID(stream.id), metadata: parseMetadata(stream.metadata) } // toStreamID() not strictly necessary
        })
        return {
            streams,
            blockNumber: min(blockNumbers)!
        }
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        const query = (streamIdOrPath !== undefined) ? await this.streamIdBuilder.toStreamID(streamIdOrPath) : GET_ALL_STORAGE_NODES
        return this.storageNodesCache.get(query)
    }

    private async getStorageNodes_nonCached(query: StreamID | typeof GET_ALL_STORAGE_NODES): Promise<EthereumAddress[]> {
        let queryResults: NodeQueryResult[]
        if (query !== GET_ALL_STORAGE_NODES) {
            const streamId = query
            this.logger.debug('Get storage nodes of stream', { streamId })
            queryResults = await collect(this.theGraphClient.queryEntities<NodeQueryResult>(
                (lastId: string, pageSize: number) => {
                    const query = `{
                        stream (id: "${streamId}") {
                            id
                            metadata
                            storageNodes (first: ${pageSize} orderBy: "id" where: { id_gt: "${lastId}"}) {
                                id
                                metadata
                                lastSeen
                            }
                        }
                    }`
                    return { query }
                },
                (response: any) => {
                    return (response.stream !== null) ? response.stream.storageNodes : []
                }
            ))
        } else {
            this.logger.debug('Get all storage nodes')
            queryResults = await collect(this.theGraphClient.queryEntities<NodeQueryResult>(
                (lastId: string, pageSize: number) => {
                    const query = `{
                        nodes (first: ${pageSize} orderBy: "id" where: { id_gt: "${lastId}"}) {
                            id
                            metadata
                            lastSeen
                        }
                    }`
                    return { query }
                }
            ))
        }
        return queryResults.map((node) => toEthereumAddress(node.id))
    }
}
