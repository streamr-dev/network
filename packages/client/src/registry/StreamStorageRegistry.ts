import type { StreamStorageRegistryV2 as StreamStorageRegistryContract } from '../ethereumArtifacts/StreamStorageRegistryV2'
import StreamStorageRegistryArtifact from '../ethereumArtifacts/StreamStorageRegistryV2Abi.json'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { Stream } from '../Stream'
import { getStreamRegistryChainProvider, getStreamRegistryOverrides } from '../Ethereum'
import { StreamID, toStreamID } from '@streamr/protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { waitForTx } from '../utils/contract'
import { SynchronizedGraphQLClient } from '../utils/SynchronizedGraphQLClient'
import { StreamrClientEventEmitter, StreamrClientEvents, initEventGateway } from '../events'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { ContractFactory } from '../ContractFactory'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StreamFactory } from '../StreamFactory'
import { collect } from '../utils/iterators'
import { min } from 'lodash'

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
    private streamStorageRegistryContract?: StreamStorageRegistryContract
    private readonly streamStorageRegistryContractReadonly: StreamStorageRegistryContract
    private readonly logger: Logger

    constructor(
        private contractFactory: ContractFactory,
        @inject(delay(() => StreamFactory)) private streamFactory: StreamFactory,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(SynchronizedGraphQLClient) private graphQLClient: SynchronizedGraphQLClient,
        @inject(StreamrClientEventEmitter) eventEmitter: StreamrClientEventEmitter,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(ConfigInjectionToken) private config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.logger = loggerFactory.createLogger(module)
        const chainProvider = getStreamRegistryChainProvider(config)
        this.streamStorageRegistryContractReadonly = this.contractFactory.createReadContract(
            toEthereumAddress(this.config.contracts.streamStorageRegistryChainAddress),
            StreamStorageRegistryArtifact,
            chainProvider,
            'streamStorageRegistry'
        ) as StreamStorageRegistryContract
        this.initStreamAssignmentEventListener('addToStorageNode', 'Added', eventEmitter)
        this.initStreamAssignmentEventListener('removeFromStorageNode', 'Removed', eventEmitter)
    }

    private initStreamAssignmentEventListener(
        clientEvent: keyof StreamrClientEvents,
        contractEvent: string,
        eventEmitter: StreamrClientEventEmitter
    ) {
        type Listener = (streamId: string, nodeAddress: string, extra: any) => void
        initEventGateway(
            clientEvent,
            (emit: (payload: StorageNodeAssignmentEvent) => void) => {
                const listener = (streamId: string, nodeAddress: string, extra: any) => {
                    emit({
                        streamId: toStreamID(streamId),
                        nodeAddress: toEthereumAddress(nodeAddress),
                        blockNumber: extra.blockNumber
                    })
                }
                this.streamStorageRegistryContractReadonly.on(contractEvent, listener)
                return listener
            },
            (listener: Listener) => {
                this.streamStorageRegistryContractReadonly.off(contractEvent, listener)
            },
            eventEmitter
        )
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
        this.logger.debug('adding stream %s to node %s', streamId, nodeAddress)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('removing stream %s from node %s', streamId, nodeAddress)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.config)
        await waitForTx(this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        this.logger.debug('querying if stream %s is stored in storage node %s', streamId, nodeAddress)
        return this.streamStorageRegistryContractReadonly.isStorageNodeOf(streamId, nodeAddress)
    }

    async getStoredStreams(nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
        this.logger.debug('getting stored streams of node %s', nodeAddress)
        const blockNumbers: number[] = []
        const res = await collect(this.graphQLClient.fetchPaginatedResults(
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
            this.logger.debug('getting storage nodes of stream %s', streamId)
            queryResults = await collect(this.graphQLClient.fetchPaginatedResults<NodeQueryResult>(
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
            this.logger.debug('getting all storage nodes')
            queryResults = await collect(this.graphQLClient.fetchPaginatedResults<NodeQueryResult>(
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
