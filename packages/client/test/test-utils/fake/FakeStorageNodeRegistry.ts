import { inject, Lifecycle, scoped } from 'tsyringe'
import { EthereumAddress, StreamID, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { DOCKER_DEV_STORAGE_NODE } from '../../../src/ConfigTest'
import { FakeStorageNode } from './FakeStorageNode'
import { ActiveNodes } from './ActiveNodes'
import { StorageNodeAssignmentEvent, StorageNodeRegistry } from '../../../src/StorageNodeRegistry'
import { Stream } from '../../../src/Stream'
import { Multimap } from '../utils'

@scoped(Lifecycle.ContainerScoped)
export class FakeStorageNodeRegistry implements Omit<StorageNodeRegistry,
    'clientConfig' | 'chainProvider' | 'streamStorageRegistryContractReadonly' |
    'chainSigner' | 'nodeRegistryContract' | 'streamStorageRegistryContract'> {

    private readonly assignments: Multimap<StreamID, EthereumAddress> = new Multimap()
    private readonly streamIdBuilder: StreamIDBuilder
    private readonly activeNodes: ActiveNodes

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(ActiveNodes) activeNodes: ActiveNodes,
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.activeNodes = activeNodes
        this.activeNodes.addNode(new FakeStorageNode(DOCKER_DEV_STORAGE_NODE, activeNodes, 'storage'))
    }

    private async hasAssignment(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        const normalizedNodeAddress = nodeAddress.toLowerCase()
        const assignments = await this.getStorageNodesOf(streamIdOrPath)
        return assignments.includes(normalizedNodeAddress)
    }

    async getStorageNodesOf(streamIdOrPath: string): Promise<EthereumAddress[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.assignments.get(streamId)
    }

    async getRandomStorageNodeFor(streamPartId: StreamPartID): Promise<FakeStorageNode> {
        const nodeAddresses = await this.getStorageNodesOf(StreamPartIDUtils.getStreamID(streamPartId))
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
    async getStorageNodeUrl(_nodeAddress: string): Promise<string> {
        // return some dummy value: the receiving component passes the info to FakeRest,
        // and it is ignored there
        return ''
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        // no-op
    }

    // eslint-disable-next-line class-methods-use-this
    isStreamStoredInStorageNodeFromContract(_streamIdOrPath: string, _nodeAddress: string): Promise<boolean> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    createOrUpdateNodeInStorageNodeRegistry(_nodeMetadata: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    removeNodeFromStorageNodeRegistry(): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    removeStreamFromStorageNode(_streamIdOrPath: string, _nodeAddress: string): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    isStreamStoredInStorageNode(_streamIdOrPath: string, _nodeAddress: string): Promise<boolean> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getStoredStreamsOf(_nodeAddress: string): Promise<{ streams: Stream[]; blockNumber: number }> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    getAllStorageNodes(): Promise<string[]> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    registerStorageEventListener(_listener: (event: StorageNodeAssignmentEvent) => any): Promise<void> {
        throw new Error('not implemented')
    }

    // eslint-disable-next-line class-methods-use-this
    unRegisterStorageEventListeners(): Promise<void> {
        throw new Error('not implemented')
    }
}
