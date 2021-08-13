import StreamrClient, { Stream } from '../dist/types/src'

import { Contract } from '@ethersproject/contracts'
import { Provider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import StreamrEthereum from '../Ethereum'
import debug from 'debug'
import type { NodeRegistry as NodeRegistryContract } from './ethereumArtifacts/NodeRegistry'
import type { StreamStorageRegistry as StreamStorageRegistryContract } from './ethereumArtifacts/StreamStorageRegistry'
import NodeRegistryArtifact from './ethereumArtifacts/NodeRegistryAbi.json'
import StreamStorageRegistryArtifact from './ethereumArtifacts/StreamStorageRegistry.json'
import fetch from 'node-fetch'
import { EthereumAddress } from '../types'
import { StorageNode } from './StorageNode'
import { StreamRegistry, StreamQueryResult } from './StreamRegistry'
import { NotFoundError } from '../rest/authFetch'
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { BrubeckContainer } from './Container'
import Ethereum from './Ethereum'

const log = debug('StreamrClient:NodeRegistry')

type NodeQueryResult = {
    id: string,
    metadata: string,
    lastseen: string,
}

type StoredStreamQueryResult = {
    stream: {
        id: string,
        metadata: string,
        storageNodes: [NodeQueryResult],
    },
}

type AllNodesQueryResult = {
    nodes: [NodeQueryResult],
}
type SingleNodeQueryResult = {
    node: NodeQueryResult,
}

type StorageNodeQueryResult = {
    node: {
        id: string,
        metadata: string,
        lastSeen: string,
        storedStreams: [StreamQueryResult]
    }
}
@scoped(Lifecycle.ContainerScoped)
export class NodeRegistry {
    ethereum: StreamrEthereum

    sideChainProvider: Provider
    nodeRegistryContractReadonly: NodeRegistryContract
    streamStorageRegistryContractReadonly: StreamStorageRegistryContract

    sideChainSigner?: Signer
    nodeRegistryContract?: NodeRegistryContract
    streamStorageRegistryContract?: StreamStorageRegistryContract

    constructor(@inject(BrubeckContainer) private container: DependencyContainer) {
        log('creating NodeRegistryOnchain')
        this.ethereum = container.resolve<Ethereum>(Ethereum)
        this.sideChainProvider = this.ethereum.getSidechainProvider()
        this.nodeRegistryContractReadonly = new Contract(this.client.options.nodeRegistrySidechainAddress,
            NodeRegistryArtifact, this.sideChainProvider) as NodeRegistryContract
        this.streamStorageRegistryContractReadonly = new Contract(this.client.options.streamStorageRegistrySidechainAddress,
            StreamStorageRegistryArtifact, this.sideChainProvider) as StreamStorageRegistryContract
    }

    // --------------------------------------------------------------------------------------------
    // Read from the NodeRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    async isStreamStoredInStorageNodeFromContract(streamId: string, nodeAddress: string): Promise<boolean> {
        log('Checking if stream %s is stored in storage node %s', streamId, nodeAddress)
        return this.streamStorageRegistryContractReadonly.isStorageNodeOf(streamId, nodeAddress.toLowerCase())
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry or StreamStorageRegistry contract
    // --------------------------------------------------------------------------------------------

    private async connectToNodeRegistryContract() {
        if (!this.sideChainSigner || !this.nodeRegistryContract) {
            this.sideChainSigner = await this.ethereum.getSidechainSigner()
            this.nodeRegistryContract = new Contract(this.client.options.nodeRegistrySidechainAddress,
                NodeRegistryArtifact, this.sideChainSigner) as NodeRegistryContract
            this.streamStorageRegistryContract = new Contract(this.client.options.streamStorageRegistrySidechainAddress,
                StreamStorageRegistryArtifact, this.sideChainSigner) as StreamStorageRegistryContract
        }
    }

    async setNode(nodeUrl: string): Promise<StorageNode> {
        log('setNode %s -> %s', nodeUrl)
        await this.connectToNodeRegistryContract()

        const tx = await this.nodeRegistryContract!.createOrUpdateNodeSelf(nodeUrl)
        await tx.wait()
        return new StorageNode(await this.client.getAddress(), nodeUrl)
    }

    async removeNode(): Promise<void> {
        log('removeNode called')
        await this.connectToNodeRegistryContract()

        const tx = await this.nodeRegistryContract!.removeNodeSelf()
        await tx.wait()
    }

    async addStreamToStorageNode(streamId: string, nodeAddress: string): Promise<void> {
        log('Adding stream %s to node %s', streamId, nodeAddress)
        await this.connectToNodeRegistryContract()

        const tx = await this.streamStorageRegistryContract!.addStorageNode(streamId, nodeAddress)
        await tx.wait()
    }

    async removeStreamFromStorageNode(streamId: string, nodeAddress: string): Promise<void> {
        log('Removing stream %s from node %s', streamId, nodeAddress)
        await this.connectToNodeRegistryContract()

        const tx = await this.streamStorageRegistryContract!.removeStorageNode(streamId, nodeAddress)
        await tx.wait()
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    async getNode(nodeAddress: string): Promise<StorageNode | null> {
        log('getnode %s ', nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildGetNodeQuery(nodeAddress.toLowerCase())) as SingleNodeQueryResult
        return res.node === null ? null : new StorageNode(res.node.id, res.node.metadata)
    }

    async isStreamStoredInStorageNode(streamId: string, nodeAddress: string): Promise<boolean> {
        log('Checking if stream %s is stored in storage node %s', streamId, nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
        if (res.node === null) {
            throw new NotFoundError('Node not found, id: ' + nodeAddress)
        }
        return res.node.storedStreams.find((stream) => stream.id === streamId) !== undefined
    }

    async getStorageNodesOf(streamId: string): Promise<StorageNode[]> {
        log('Getting storage nodes of stream %s', streamId)
        const res = await this.sendNodeQuery(NodeRegistry.buildStoredStreamQuery(streamId)) as StoredStreamQueryResult
        return res.stream.storageNodes.map((node) => new StorageNode(node.id, node.metadata))
    }

    async getStoredStreamsOf(nodeAddress: string): Promise<Stream[]> {
        log('Getting stored streams of node %s', nodeAddress)
        const res = await this.sendNodeQuery(NodeRegistry.buildStorageNodeQuery(nodeAddress.toLowerCase())) as StorageNodeQueryResult
        return res.node.storedStreams.map((stream) => StreamRegistry.parseStreamFromProps(this.client, stream.id, stream.metadata))
    }

    async getAllStorageNodes(): Promise<StorageNode[]> {
        log('Getting all storage nodes')
        const res = await this.sendNodeQuery(NodeRegistry.buildAllNodesQuery()) as AllNodesQueryResult
        return res.nodes.map((node) => new StorageNode(node.id, node.metadata))
    }

    private async sendNodeQuery(gqlQuery: string): Promise<Object> {
        log('GraphQL query: %s', gqlQuery)
        const res = await fetch(this.client.options.theGraphUrl, {
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

    private static buildStoredStreamQuery(streamid: string): string {
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
                storedStreams {
                    id,
                    metadata,
                }
            }
        }`
        return JSON.stringify({ query })
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

