import { StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { Stream } from '../../../src/Stream'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { Methods } from '../types'
import { FakeChain } from './FakeChain'
import { FakeNetwork } from './FakeNetwork'
import { FakeStorageNode } from './FakeStorageNode'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamStorageRegistry implements Methods<StreamStorageRegistry> {

    private readonly chain: FakeChain
    private readonly network: FakeNetwork
    private readonly streamIdBuilder: StreamIDBuilder

    constructor(
        chain: FakeChain,
        network: FakeNetwork,
        streamIdBuilder: StreamIDBuilder
    ) {
        this.chain = chain
        this.network = network
        this.streamIdBuilder = streamIdBuilder
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            return this.chain.storageAssignments.get(streamId)
        } else {
            throw new Error('not implemented')
        }
    }

    async getRandomStorageNodeFor(streamPartId: StreamPartID): Promise<FakeStorageNode> {
        const nodeAddresses = await this.getStorageNodes(StreamPartIDUtils.getStreamID(streamPartId))
        if (nodeAddresses.length > 0) {
            const chosenAddress = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
            const storageNode = this.network.getNode(chosenAddress)
            if (storageNode !== undefined) {
                return storageNode as FakeStorageNode
            } else {
                throw new Error('no storage node online: ' + chosenAddress)
            }
        } else {
            throw new Error('no storage node assignments for ' + streamPartId)
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        if (!(await this.isStoredStream(streamIdOrPath, nodeAddress))) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            const node = this.network.getNode(nodeAddress)
            if (node !== undefined) {
                this.chain.storageAssignments.add(streamId, nodeAddress)
                await (node as FakeStorageNode).addAssignment(streamId)
            } else {
                throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
            }
        }
    }

    // eslint-disable-next-line class-methods-use-this
    removeStreamFromStorageNode(_streamIdOrPath: string, _nodeAddress: string): Promise<void> {
        throw new Error('not implemented')
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const assignments = await this.getStorageNodes(streamIdOrPath)
        return assignments.includes(nodeAddress)
    }

    // eslint-disable-next-line class-methods-use-this
    getStoredStreams(_nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
        throw new Error('not implemented')
    }
}
