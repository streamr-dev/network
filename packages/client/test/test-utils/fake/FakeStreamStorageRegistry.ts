import { inject, Lifecycle, scoped } from 'tsyringe'
import { EthereumAddress, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { FakeStorageNode } from './FakeStorageNode'
import { FakeNetwork } from './FakeNetwork'
import { Stream } from '../../../src/Stream'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { Methods } from '../types'
import { FakeChain } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamStorageRegistry implements Methods<StreamStorageRegistry> {

    private readonly chain: FakeChain
    private readonly network: FakeNetwork
    private readonly streamIdBuilder: StreamIDBuilder

    constructor(
        @inject(FakeChain) chain: FakeChain,
        @inject(FakeNetwork) network: FakeNetwork,
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder
    ) {
        this.chain = chain
        this.network = network
        this.streamIdBuilder = streamIdBuilder
    }

    private async hasAssignment(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const normalizedNodeAddress = nodeAddress.toLowerCase()
        const assignments = await this.getStorageNodes(streamIdOrPath)
        return assignments.includes(normalizedNodeAddress)
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            return this.chain.storageAssignments.get(streamId)
            // eslint-disable-next-line no-else-return
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
                // eslint-disable-next-line no-else-return
            } else {
                throw new Error('no storage node online: ' + chosenAddress)
            }
        } else {
            throw new Error('no storage node assignments for ' + streamPartId)
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        if (!(await this.hasAssignment(streamIdOrPath, nodeAddress))) {
            const normalizedNodeAddress = nodeAddress.toLowerCase()
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            const node = this.network.getNode(nodeAddress)
            if (node !== undefined) {
                this.chain.storageAssignments.add(streamId, normalizedNodeAddress)
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

    // eslint-disable-next-line class-methods-use-this
    isStoredStream(_streamIdOrPath: string, _nodeAddress: string): Promise<boolean> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStoredStreams(_nodeAddress: EthereumAddress): Promise<{ streams: Stream[], blockNumber: number }> {
        throw new Error('not implemented')
    }
}
