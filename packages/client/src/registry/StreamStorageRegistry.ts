import { Provider } from '@ethersproject/providers'
import { StreamID, toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, collect, toEthereumAddress } from '@streamr/utils'
import min from 'lodash/min'
import { Lifecycle, delay, inject, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { ContractFactory } from '../ContractFactory'
import { getStreamRegistryChainProviders, getStreamRegistryOverrides } from '../Ethereum'
import { Stream } from '../Stream'
import { StreamFactory } from '../StreamFactory'
import { StreamIDBuilder } from '../StreamIDBuilder'
import type { StreamStorageRegistryV2 as StreamStorageRegistryContract } from '../ethereumArtifacts/StreamStorageRegistryV2'
import StreamStorageRegistryArtifact from '../ethereumArtifacts/StreamStorageRegistryV2Abi.json'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'
import { TheGraphClient } from '@streamr/utils'
import { initContractEventGateway, queryAllReadonlyContracts, waitForTx } from '../utils/contract'

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

/**
 * Stores storage node assignments (mapping of streamIds <-> storage nodes addresses)
 */
@scoped(Lifecycle.ContainerScoped)
export class StreamStorageRegistry {

    private contractFactory: ContractFactory
    private streamFactory: StreamFactory
    private streamIdBuilder: StreamIDBuilder
    private theGraphClient: TheGraphClient
    private authentication: Authentication
    private streamStorageRegistryContract?: StreamStorageRegistryContract
    private config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly streamStorageRegistryContractsReadonly: StreamStorageRegistryContract[]
    private readonly logger: Logger

    constructor(
        contractFactory: ContractFactory,
        @inject(delay(() => StreamFactory)) streamFactory: StreamFactory,
        streamIdBuilder: StreamIDBuilder,
        theGraphClient: TheGraphClient,
        eventEmitter: StreamrClientEventEmitter,
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.contractFactory = contractFactory
        this.streamFactory = streamFactory
        this.streamIdBuilder = streamIdBuilder
        this.theGraphClient = theGraphClient
        this.authentication = authentication
        this.config = config
        this.logger = loggerFactory.createLogger(module)
        this.streamStorageRegistryContractsReadonly = getStreamRegistryChainProviders(config).map((provider: Provider) => {
            return this.contractFactory.createReadContract(
                toEthereumAddress(this.config.contracts.streamStorageRegistryChainAddress),
                StreamStorageRegistryArtifact,
                provider,
                'streamStorageRegistry'
            ) as StreamStorageRegistryContract
        })
        this.initStreamAssignmentEventListeners(eventEmitter, loggerFactory)
    }

    private initStreamAssignmentEventListeners(eventEmitter: StreamrClientEventEmitter, loggerFactory: LoggerFactory) {
        const primaryReadonlyContract = this.streamStorageRegistryContractsReadonly[0]
        const transformation = (streamId: string, nodeAddress: string, extra: any) => ({
            streamId: toStreamID(streamId),
            nodeAddress: toEthereumAddress(nodeAddress),
            blockNumber: extra.blockNumber
        })
        initContractEventGateway({
            sourceName: 'Added', 
            sourceEmitter: primaryReadonlyContract,
            targetName: 'addToStorageNode',
            targetEmitter: eventEmitter,
            transformation,
            loggerFactory
        })
        initContractEventGateway({
            sourceName: 'Removed', 
            sourceEmitter: primaryReadonlyContract,
            targetName: 'removeFromStorageNode',
            targetEmitter: eventEmitter,
            transformation,
            loggerFactory
        })
    }

    private async connectToContract() {
        if (!this.streamStorageRegistryContract) {
            const chainSigner = await this.authentication.getStreamRegistryChainSigner()
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
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Remove stream from storage node', { streamId, nodeAddress })
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('Check if stream is stored in storage node', { streamId, nodeAddress })
        return queryAllReadonlyContracts((contract: StreamStorageRegistryContract) => {
            return contract.isStorageNodeOf(streamId, nodeAddress)
        }, this.streamStorageRegistryContractsReadonly)
    }

    async getStoredStreams(nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
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
            const props = Stream.parseMetadata(stream.metadata)
            return this.streamFactory.createStream(toStreamID(stream.id), props) // toStreamID() not strictly necessary
        })
        return {
            streams,
            blockNumber: min(blockNumbers)!
        }
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        let queryResults: NodeQueryResult[]
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
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
