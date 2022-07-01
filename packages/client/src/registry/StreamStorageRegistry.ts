import { Contract } from '@ethersproject/contracts'
import debug from 'debug'
import type { StreamStorageRegistry as StreamStorageRegistryContract } from '../ethereumArtifacts/StreamStorageRegistry'
import StreamStorageRegistryArtifact from '../ethereumArtifacts/StreamStorageRegistry.json'
import { StreamQueryResult } from './StreamRegistry'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from '../Container'
import { ConfigInjectionToken } from '../Config'
import { Stream, StreamProperties } from '../Stream'
import { EthereumConfig, getStreamRegistryChainProvider, getStreamRegistryOverrides } from '../Ethereum'
import { EthereumAddress, StreamID, toStreamID } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { waitForTx, withErrorHandlingAndLogging } from '../utils/contract'
import { SynchronizedGraphQLClient, createWriteContract } from '../utils/SynchronizedGraphQLClient'
import { StreamrClientEventEmitter, StreamrClientEvents, initEventGateway } from '../events'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'

/**
 * Stores storage node assignments (mapping of streamIds <-> storage nodes addresses)
 */

const log = debug('StreamrClient:StreamStorageRegistry')

export type StorageNodeAssignmentEvent = {
    streamId: string,
    nodeAddress: EthereumAddress,
    blockNumber: number
}

type NodeQueryResult = {
    id: string,
    metadata: string,
    lastseen: string,
}

type StoredStreamQueryResult = {
    stream: {
        id: string,
        metadata: string,
        storageNodes: NodeQueryResult[],
    } | null,
}

type AllNodesQueryResult = {
    nodes: NodeQueryResult[],
}

type StorageNodeQueryResult = {
    node: {
        id: string,
        metadata: string,
        lastSeen: string,
        storedStreams: StreamQueryResult[]
    }
    _meta: {
        block: {
            number: number
        }
    }
}

@scoped(Lifecycle.ContainerScoped)
export class StreamStorageRegistry {

    private streamStorageRegistryContract?: StreamStorageRegistryContract
    private streamStorageRegistryContractReadonly: StreamStorageRegistryContract

    constructor(
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(SynchronizedGraphQLClient) private graphQLClient: SynchronizedGraphQLClient,
        @inject(StreamrClientEventEmitter) eventEmitter: StreamrClientEventEmitter,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Ethereum) private ethereumConfig: EthereumConfig,
    ) {
        const chainProvider = getStreamRegistryChainProvider(ethereumConfig)
        this.streamStorageRegistryContractReadonly = withErrorHandlingAndLogging(
            new Contract(this.ethereumConfig.streamStorageRegistryChainAddress, StreamStorageRegistryArtifact, chainProvider),
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
                        streamId,
                        nodeAddress,
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
            this.streamStorageRegistryContract = createWriteContract<StreamStorageRegistryContract>(
                this.ethereumConfig.streamStorageRegistryChainAddress,
                StreamStorageRegistryArtifact,
                chainSigner,
                'streamStorageRegistry',
                this.graphQLClient
            )
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Adding stream %s to node %s', streamId, nodeAddress)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
        await waitForTx(this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Removing stream %s from node %s', streamId, nodeAddress)
        await this.connectToContract()
        const ethersOverrides = getStreamRegistryOverrides(this.ethereumConfig)
        await waitForTx(this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Checking if stream %s is stored in storage node %s', streamId, nodeAddress)
        return this.streamStorageRegistryContractReadonly.isStorageNodeOf(streamId, nodeAddress.toLowerCase())
    }

    async getStoredStreams(nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
        log('Getting stored streams of node %s', nodeAddress)
        const query = StreamStorageRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())
        const res = await this.graphQLClient.sendQuery(query) as StorageNodeQueryResult
        const streams = res.node.storedStreams.map((stream) => {
            const props: StreamProperties = Stream.parsePropertiesFromMetadata(stream.metadata)
            return new Stream({ ...props, id: toStreamID(stream.id) }, this.container) // toStreamID() not strictly necessary
        })
        return {
            streams,
            // eslint-disable-next-line no-underscore-dangle
            blockNumber: res._meta.block.number
        }
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            log('Getting storage nodes of stream %s', streamId)
            const query = StreamStorageRegistry.buildStoredStreamQuery(streamId)
            const res = await this.graphQLClient.sendQuery(query) as StoredStreamQueryResult
            if (res.stream === null) {
                return []
            }
            return res.stream.storageNodes.map((node) => node.id)
            // eslint-disable-next-line no-else-return
        } else {
            log('Getting all storage nodes')
            const query = StreamStorageRegistry.buildAllNodesQuery()
            const res = await this.graphQLClient.sendQuery(query) as AllNodesQueryResult
            return res.nodes.map((node) => node.id)
        }
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    private static buildAllNodesQuery(): string {
        const query = `{
            nodes {
                id,
                metadata,
                lastSeen
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildStoredStreamQuery(streamId: StreamID): string {
        const query = `{
            stream (id: "${streamId}") {
                id,
                metadata,
                storageNodes {
                    id,
                    metadata,
                    lastSeen,
                }
            }
        }`
        return JSON.stringify({ query })
    }

    private static buildStorageNodeQuery(nodeAddress: EthereumAddress): string {
        const query = `{
            node (id: "${nodeAddress}") {
                id,
                metadata,
                lastSeen,
                storedStreams (first:1000) {
                    id,
                    metadata,
                }
            }
            _meta {
                block {
                    number
                }
            }
        }`
        return JSON.stringify({ query })
    }
}
