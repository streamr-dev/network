import { Contract } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import debug from 'debug'
import type { NodeRegistry as NodeRegistryContract } from './ethereumArtifacts/NodeRegistry.d'
import type { StreamStorageRegistry as StreamStorageRegistryContract } from './ethereumArtifacts/StreamStorageRegistry.d'
import NodeRegistryArtifact from './ethereumArtifacts/NodeRegistryAbi.json'
import StreamStorageRegistryArtifact from './ethereumArtifacts/StreamStorageRegistry.json'
import fetch from 'node-fetch'
import { StreamQueryResult } from './StreamRegistry'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import { Config, StrictStreamrClientConfig } from './Config'
import { Stream, StreamProperties } from './Stream'
import Ethereum from './Ethereum'
import { NotFoundError } from '.'
import { until } from './utils'
import { EthereumAddress, StreamID, toStreamID } from 'streamr-client-protocol'

const log = debug('StreamrClient:NodeRegistry')

export type EthereumStorageEvent = {
    streamId: string,
    nodeAddress: EthereumAddress,
    type: 'added' | 'removed'
}

export type NetworkSmartContract = {
    contractAddress: string
    jsonRpcProvider: string
}

export type NodeRegistryItem = {
    address: string
    url: string
}

export type NodeRegistryOptions = NetworkSmartContract

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
    },
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
}
@scoped(Lifecycle.ContainerScoped)
export class NodeRegistry {
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
        @inject(Config.Root) clientConfig: StrictStreamrClientConfig
    ) {
        log('creating NodeRegistryOnchain')
        this.clientConfig = clientConfig
        this.chainProvider = this.ethereum.getStreamRegistryChainProvider()
        this.nodeRegistryContractReadonly = new Contract(this.clientConfig.nodeRegistryChainAddress,
            NodeRegistryArtifact, this.chainProvider) as NodeRegistryContract
        this.streamStorageRegistryContractReadonly = new Contract(this.clientConfig.streamStorageRegistryChainAddress,
            StreamStorageRegistryArtifact, this.chainProvider) as StreamStorageRegistryContract
    }

    // --------------------------------------------------------------------------------------------
    // Read from the NodeRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    async isStreamStoredInStorageNodeFromContract(streamId: string, nodeAddress: string): Promise<boolean> {
        const id = toStreamID(streamId)
        log('Checking if stream %s is stored in storage node %s', id, nodeAddress)
        return this.streamStorageRegistryContractReadonly.isStorageNodeOf(id, nodeAddress.toLowerCase())
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    private async connectToNodeRegistryContract() {
        if (!this.chainSigner || !this.nodeRegistryContract) {
            this.chainSigner = await this.ethereum.getStreamRegistryChainSigner()
            this.nodeRegistryContract = new Contract(this.clientConfig.nodeRegistryChainAddress,
                NodeRegistryArtifact, this.chainSigner) as NodeRegistryContract
            this.streamStorageRegistryContract = new Contract(this.clientConfig.streamStorageRegistryChainAddress,
                StreamStorageRegistryArtifact, this.chainSigner) as StreamStorageRegistryContract
        }
    }

    async setNode(nodeMetadata: string): Promise<void> {
        log('setNode %s -> %s', nodeMetadata)
        await this.connectToNodeRegistryContract()
        const nodeAddress = await this.ethereum.getAddress()
        const tx = await this.nodeRegistryContract!.createOrUpdateNodeSelf(nodeMetadata)
        await tx.wait()
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

    async removeNode(): Promise<void> {
        log('removeNode called')
        await this.connectToNodeRegistryContract()

        const tx = await this.nodeRegistryContract!.removeNodeSelf()
        await tx.wait()
    }

    async addStreamToStorageNode(streamId: string, nodeAddress: string): Promise<void> {
        const id = toStreamID(streamId)
        log('Adding stream %s to node %s', id, nodeAddress)
        await this.connectToNodeRegistryContract()

        const tx = await this.streamStorageRegistryContract!.addStorageNode(id, nodeAddress)
        await tx.wait()
        await until(async () => { return this.isStreamStoredInStorageNode(id, nodeAddress) }, 10000, 500,
            () => `Failed to add stream ${id} to storageNode ${nodeAddress}, timed out querying fact from theGraph`)
    }

    async removeStreamFromStorageNode(streamId: string, nodeAddress: string): Promise<void> {
        const id = toStreamID(streamId)
        log('Removing stream %s from node %s', id, nodeAddress)
        await this.connectToNodeRegistryContract()

        const tx = await this.streamStorageRegistryContract!.removeStorageNode(id, nodeAddress)
        await tx.wait()
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    async getStorageNodeUrl(nodeAddress: string): Promise<string> {
        log('getnode %s ', nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildGetNodeQuery(nodeAddress.toLowerCase())) as SingleNodeQueryResult
        if (res.node === null) {
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
        const metadata = JSON.parse(res.node.metadata)
        return metadata.http
    }

    async isStreamStoredInStorageNode(streamId: string, nodeAddress: string): Promise<boolean> {
        const id = toStreamID(streamId)
        log('Checking if stream %s is stored in storage node %s', id, nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
        if (res.node === null) {
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
        return res.node.storedStreams.find((stream) => stream.id === id) !== undefined
    }

    async getStorageNodesOf(streamId: string): Promise<EthereumAddress[]> {
        const id = toStreamID(streamId)
        log('Getting storage nodes of stream %s', id)
        const res = await this.sendNodeQuery(NodeRegistry.buildStoredStreamQuery(id)) as StoredStreamQueryResult
        return res.stream.storageNodes.map((node) => node.id)
    }

    async getStoredStreamsOf(nodeAddress: string): Promise<Stream[]> {
        log('Getting stored streams of node %s', nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
        return res.node.storedStreams.map((stream) => this.parseStream(stream.id, stream.metadata))
    }

    async getAllStorageNodes(): Promise<EthereumAddress[]> {
        log('Getting all storage nodes')
        const res = await this.sendNodeQuery(NodeRegistry.buildAllNodesQuery()) as AllNodesQueryResult
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

    parseStream(id: string, propsString: string): Stream {
        const parsedProps: StreamProperties = Stream.parseStreamPropsFromJson(propsString)
        return new Stream({ ...parsedProps, id }, this.container)
    }

    async registerStorageEventListener(callback: (arg0: EthereumStorageEvent) => any) {
        this.streamStorageRegistryContractReadonly.on('Added', (streamId: string, nodeAddress: string) => {
            callback({ streamId, nodeAddress, type: 'added' })
        })
        this.streamStorageRegistryContractReadonly.on('Removed', (streamId: string, nodeAddress: string) => {
            callback({ streamId, nodeAddress, type: 'removed' })
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

    private static buildStoredStreamQuery(streamid: StreamID): string {
        const query = `{
            stream (id: "${streamid}") {
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

