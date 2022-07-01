import { inject, Lifecycle, scoped } from 'tsyringe'
import { EthereumAddress, StreamID, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { DOCKER_DEV_STORAGE_NODE } from '../../../src/ConfigTest'
import { FakeStorageNode } from './FakeStorageNode'
import { ActiveNodes } from './ActiveNodes'
import { Stream } from '../../../src/Stream'
import { Multimap } from '../Multimap'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { Methods } from '../types'

@scoped(Lifecycle.ContainerScoped)
export class FakeStreamStorageRegistry implements Methods<StreamStorageRegistry> {

    private readonly assignments: Multimap<StreamID, EthereumAddress> = new Multimap()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly activeNodes: ActiveNodes

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(ActiveNodes) activeNodes: ActiveNodes,
        @inject(StreamRegistry) streamRegistry: StreamRegistry
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.activeNodes = activeNodes
        this.activeNodes.addNode(new FakeStorageNode(DOCKER_DEV_STORAGE_NODE, activeNodes, 'storage', streamRegistry))
    }

    private async hasAssignment(streamIdOrPath: string, nodeAddress: EthereumAddress): Promise<boolean> {
        const normalizedNodeAddress = nodeAddress.toLowerCase()
        const assignments = await this.getStorageNodes(streamIdOrPath)
        return assignments.includes(normalizedNodeAddress)
    }

    async getStorageNodes(streamIdOrPath?: string): Promise<EthereumAddress[]> {
        if (streamIdOrPath !== undefined) {
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            return this.assignments.get(streamId)
            // eslint-disable-next-line no-else-return
        } else {
            throw new Error('not implemented')
        }
    }

    async getRandomStorageNodeFor(streamPartId: StreamPartID): Promise<FakeStorageNode> {
        const nodeAddresses = await this.getStorageNodes(StreamPartIDUtils.getStreamID(streamPartId))
        if (nodeAddresses.length > 0) {
            const chosenAddress = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
            const storageNode = this.activeNodes.getNode(chosenAddress)
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
            const node = this.activeNodes.getNode(nodeAddress)
            if (node !== undefined) {
                this.assignments.add(streamId, normalizedNodeAddress)
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
    getStoredStreams(_nodeAddress: EthereumAddress): Promise<{ streams: Stream[]; blockNumber: number }> {
        throw new Error('not implemented')
    }
}
