import { Contract } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import debug from 'debug'
import type { NodeRegistry as NodeRegistryContract } from './ethereumArtifacts/NodeRegistry'
import type { StreamStorageRegistry as StreamStorageRegistryContract } from './ethereumArtifacts/StreamStorageRegistry'
import NodeRegistryArtifact from './ethereumArtifacts/NodeRegistryAbi.json'
import StreamStorageRegistryArtifact from './ethereumArtifacts/StreamStorageRegistry.json'
import fetch from './utils/fetch'
import { StreamQueryResult } from './StreamRegistry'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import { Config, StrictStreamrClientConfig } from './Config'
import { Stream, StreamProperties } from './Stream'
import Ethereum from './Ethereum'
import { NotFoundError } from '.'
import { until } from './utils'
import { EthereumAddress, StreamID, toStreamID } from 'streamr-client-protocol'
import { StreamIDBuilder } from './StreamIDBuilder'
import { waitForTx, withErrorHandlingAndLogging } from './utils/contract'

const log = debug('StreamrClient:StorageNodeRegistry')

export type StorageNodeAssignmentEvent = {
    streamId: string,
    nodeAddress: EthereumAddress,
    type: 'added' | 'removed'
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
type SingleNodeQueryResult = {
    node: NodeQueryResult,
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
export class StorageNodeRegistry {
    clientConfig: StrictStreamrClientConfig
    chainProvider: Provider
    nodeRegistryContractReadonly: NodeRegistryContract
    streamStorageRegistryContractReadonly: StreamStorageRegistryContract

    chainSigner?: Signer
    nodeRegistryContract?: NodeRegistryContract
    streamStorageRegistryContract?: StreamStorageRegistryContract

    constructor(
        @inject(BrubeckContainer) private container: DependencyContainer,
        @inject(Ethereum) private ethereum: Ethereum,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(Config.Root) clientConfig: StrictStreamrClientConfig
    ) {
        this.clientConfig = clientConfig
        this.chainProvider = this.ethereum.getStreamRegistryChainProviders()[0]
        this.nodeRegistryContractReadonly = withErrorHandlingAndLogging(
            new Contract(this.clientConfig.storageNodeRegistryChainAddress, NodeRegistryArtifact, this.chainProvider),
            'storageNodeRegistry'
        ) as NodeRegistryContract
        this.streamStorageRegistryContractReadonly = withErrorHandlingAndLogging(
            new Contract(this.clientConfig.streamStorageRegistryChainAddress, StreamStorageRegistryArtifact, this.chainProvider),
            'streamStorageRegistry'
        ) as StreamStorageRegistryContract
    }

    // --------------------------------------------------------------------------------------------
    // Read from the NodeRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    async isStreamStoredInStorageNodeFromContract(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Checking if stream %s is stored in storage node %s', streamId, nodeAddress)
        return this.streamStorageRegistryContractReadonly.isStorageNodeOf(streamId, nodeAddress.toLowerCase())
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    private async connectToNodeRegistryContract() {
        if (!this.chainSigner || !this.nodeRegistryContract) {
            this.chainSigner = await this.ethereum.getStreamRegistryChainSigner()
            this.nodeRegistryContract = withErrorHandlingAndLogging(
                new Contract(this.clientConfig.storageNodeRegistryChainAddress, NodeRegistryArtifact, this.chainSigner),
                'storageNodeRegistry'
            ) as NodeRegistryContract
            this.streamStorageRegistryContract = withErrorHandlingAndLogging(
                new Contract(this.clientConfig.streamStorageRegistryChainAddress, StreamStorageRegistryArtifact, this.chainSigner),
                'streamStorageRegistry'
            ) as StreamStorageRegistryContract
        }
    }

    async createOrUpdateNodeInStorageNodeRegistry(nodeMetadata: string): Promise<void> {
        log('setNode %s -> %s', nodeMetadata)
        await this.connectToNodeRegistryContract()
        const ethersOverrides = this.ethereum.getStreamRegistryOverrides()
        await waitForTx(this.nodeRegistryContract!.createOrUpdateNodeSelf(nodeMetadata, ethersOverrides))

        const nodeAddress = await this.ethereum.getAddress()
        await until(async () => {
            try {
                const url = await this.getStorageNodeUrl(nodeAddress)
                return nodeMetadata.includes(url)
            } catch (err) {
                return false
            }
        }, 10000, 500,
        () => `Failed to create/update node ${nodeAddress}, timed out querying fact from theGraph`)
    }

    async removeNodeFromStorageNodeRegistry(): Promise<void> {
        log('removeNode called')
        await this.connectToNodeRegistryContract()
        const ethersOverrides = this.ethereum.getStreamRegistryOverrides()
        await waitForTx(this.nodeRegistryContract!.removeNodeSelf(ethersOverrides))
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Adding stream %s to node %s', streamId, nodeAddress)
        await this.connectToNodeRegistryContract()
        const ethersOverrides = this.ethereum.getStreamRegistryOverrides()
        await waitForTx(this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress, ethersOverrides))
        await until(async () => { return this.isStreamStoredInStorageNode(streamId, nodeAddress) }, 10000, 500,
            () => `Failed to add stream ${streamId} to storageNode ${nodeAddress}, timed out querying fact from theGraph`)
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Removing stream %s from node %s', streamId, nodeAddress)
        await this.connectToNodeRegistryContract()
        const ethersOverrides = this.ethereum.getStreamRegistryOverrides()
        await waitForTx(this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress, ethersOverrides))
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    async getStorageNodeUrl(nodeAddress: string): Promise<string> {
        log('getnode %s ', nodeAddress)
        const res = await this.sendNodeQuery(StorageNodeRegistry.buildGetNodeQuery(nodeAddress.toLowerCase())) as SingleNodeQueryResult
        if (res.node === null) {
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
        const metadata = JSON.parse(res.node.metadata)
        return metadata.http
    }

    async isStreamStoredInStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Checking if stream %s is stored in storage node %s', streamId, nodeAddress)
        const res = await this.sendNodeQuery(StorageNodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
        if (res.node === null) {
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
        const found = res.node.storedStreams.find((stream) => stream.id === streamId)
        return found !== undefined
    }

    async getStorageNodesOf(streamIdOrPath: string): Promise<EthereumAddress[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        log('Getting storage nodes of stream %s', streamId)
        const res = await this.sendNodeQuery(StorageNodeRegistry.buildStoredStreamQuery(streamId)) as StoredStreamQueryResult
        if (res.stream === null) {
            return []
        }
        return res.stream.storageNodes.map((node) => node.id)
    }

    async getStoredStreamsOf(nodeAddress: string): Promise<{ streams: Stream[], blockNumber: number }> {
        log('Getting stored streams of node %s', nodeAddress)
        const res = await this.sendNodeQuery(StorageNodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
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

    async getAllStorageNodes(): Promise<EthereumAddress[]> {
        log('Getting all storage nodes')
        const res = await this.sendNodeQuery(StorageNodeRegistry.buildAllNodesQuery()) as AllNodesQueryResult
        return res.nodes.map((node) => node.id)
    }

    private async sendNodeQuery(gqlQuery: string): Promise<Object> {
        log('GraphQL query: %s', gqlQuery)
        const res = await fetch(this.clientConfig.theGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
            },
            body: gqlQuery
        })
        const resJson = await res.json()
        log('GraphQL response: %o', resJson)
        if (!resJson.data) {
            if (resJson.errors && resJson.errors.length > 0) {
                throw new Error('GraphQL query failed: ' + JSON.stringify(resJson.errors.map((e: any) => e.message)))
            } else {
                throw new Error('GraphQL query failed')
            }
        }
        return resJson.data
    }

    async registerStorageEventListener(callback: (event: StorageNodeAssignmentEvent) => any) {
        this.streamStorageRegistryContractReadonly.on('Added', (streamId: string, nodeAddress: string, extra: any) => {
            callback({ streamId, nodeAddress, type: 'added', blockNumber: extra.blockNumber })
        })
        this.streamStorageRegistryContractReadonly.on('Removed', (streamId: string, nodeAddress: string, extra: any) => {
            callback({ streamId, nodeAddress, type: 'removed', blockNumber: extra.blockNumber })
        })
    }

    async unRegisterStorageEventListeners() {
        this.streamStorageRegistryContractReadonly.removeAllListeners()
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL query builders
    // --------------------------------------------------------------------------------------------

    // graphql over fetch:
    // https://stackoverflow.com/questions/44610310/node-fetch-post-request-using-graphql-query

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

    private static buildGetNodeQuery(nodeAddress: string): string {
        const query = `{
            node (id: "${nodeAddress}") {
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

    async stop() {
        // if (!this.didInitialize) {
        //     return
        // }
    //     const contractTask = this.getContract()
    //     this.getContract.reset()
    // nodeRegistryContract?: NodeRegistryContract
        // this.didInitialize = false
        // const contract = await contractTask
        if (this.nodeRegistryContract) {
            this.nodeRegistryContract.removeAllListeners()
            this.nodeRegistryContract.provider.removeAllListeners()
        }
    }

    // static buildGetFilteredNodeListQuery(filter: NodeListQuery): string {
    //     const nameparam = filter.name ? `metadata_contains: "name\\\\\\":\\\\\\"${filter.name}"` : ''
    //     const maxparam = filter.max ? `, first: ${filter.max}` : ''
    //     const offsetparam = filter.offset ? `, skip: ${filter.offset}` : ''
    //     const orderByParam = filter.sortBy ? `, orderBy: ${filter.sortBy}` : ''
    //     const ascDescParama = filter.order ? `, orderDirection: ${filter.order}` : ''
    //     const query = `{
    //         streams (where: {${nameparam}}${maxparam}${offsetparam}${orderByParam}${ascDescParama})
    //           { id, metadata, permissions
    //             { id, userAddress, edit, canDelete, publishExpiration,
    //               subscribeExpiration, share
    //             }
    //           }
    //       }`
    //     return JSON.stringify({ query })
    // }
}

