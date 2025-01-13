import { Methods } from '@streamr/test-utils'
import { EthereumAddress, StreamID } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { StreamMetadata } from '../../../src'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { StreamStorageRegistry } from '../../../src/contracts/StreamStorageRegistry'
import { FakeChain } from './FakeChain'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamStorageRegistry implements Methods<StreamStorageRegistry> {
    private readonly chain: FakeChain
    private readonly streamIdBuilder: StreamIDBuilder

    constructor(chain: FakeChain, streamIdBuilder: StreamIDBuilder) {
        this.chain = chain
        this.streamIdBuilder = streamIdBuilder
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            return this.chain.getStorageAssignments(streamId)
        } else {
            throw new Error('not implemented')
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        if (this.isStorageNode(nodeAddress)) {
            this.chain.addStorageAssignment(streamId, nodeAddress)
        } else {
            throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
        }
    }

    async removeStreamFromStorageNode(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<void> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        if (this.isStorageNode(nodeAddress)) {
            this.chain.removeStorageAssignment(streamId, nodeAddress)
        } else {
            throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
        }
    }

    async isStoredStream(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const assignments = await this.getStorageNodes(streamIdOrPath)
        return assignments.includes(nodeAddress)
    }

    private isStorageNode(address: EthereumAddress): boolean {
        return this.chain.getStorageNodeMetadata(address) !== undefined
    }

    // eslint-disable-next-line class-methods-use-this
    getStoredStreams(): Promise<{ streams: { id: StreamID; metadata: StreamMetadata }[]; blockNumber: number }> {
        throw new Error('not implemented')
    }
}
