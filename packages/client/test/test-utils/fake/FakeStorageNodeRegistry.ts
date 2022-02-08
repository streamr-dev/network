import { inject, Lifecycle, scoped } from 'tsyringe'
import { EthereumAddress, StreamID, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { StreamIDBuilder } from '../../../src/StreamIDBuilder'
import { DOCKER_DEV_STORAGE_NODE } from '../../../src/ConfigTest'
import { FakeStorageNode } from './FakeStorageNode'
import { ActiveNodes } from './ActiveNodes'

@scoped(Lifecycle.ContainerScoped)
export class FakeStorageNodeRegistry {

    private assignments: Map<StreamID, EthereumAddress[]> = new Map()
    private streamIdBuilder: StreamIDBuilder
    private fakeBrubeckNodeRegistry: ActiveNodes

    constructor(
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
        @inject(ActiveNodes) fakeBrubeckNodeRegistry: ActiveNodes,
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.fakeBrubeckNodeRegistry = fakeBrubeckNodeRegistry
        this.fakeBrubeckNodeRegistry.addNode(new FakeStorageNode(DOCKER_DEV_STORAGE_NODE, fakeBrubeckNodeRegistry, 'storage'))
    }

    private async hasAssignment(streamIdOrPath: string, nodeAddress: string): Promise<boolean> {
        const normalizedNodeAddress = nodeAddress.toLowerCase()
        const assignments = await this.getStorageNodesOf(streamIdOrPath)
        return assignments.includes(normalizedNodeAddress)
    }

    async getStorageNodesOf(streamIdOrPath: string): Promise<EthereumAddress[]> {
        const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
        return this.assignments.get(streamId) ?? []
    }

    async getRandomStorageNodeFor(streamPartId: StreamPartID): Promise<FakeStorageNode> {
        const nodeAddresses = await this.getStorageNodesOf(StreamPartIDUtils.getStreamID(streamPartId))
        if (nodeAddresses.length > 0) {
            const chosenAddress = nodeAddresses[Math.floor(Math.random() * nodeAddresses.length)]
            const storageNode = this.fakeBrubeckNodeRegistry.getNode(chosenAddress)
            if (storageNode !== undefined) {
                return storageNode as FakeStorageNode
                // eslint-disable-next-line no-else-return
            } else {
                throw new Error('no storage node available: ' + chosenAddress)
            }
        } else {
            throw new Error('no storage node assignments for ' + streamPartId)
        }
    }

    async addStreamToStorageNode(streamIdOrPath: string, nodeAddress: string): Promise<void> {
        if (!(await this.hasAssignment(streamIdOrPath, nodeAddress))) {
            const normalizedNodeAddress = nodeAddress.toLowerCase()
            const streamId = await this.streamIdBuilder.toStreamID(streamIdOrPath)
            const node = this.fakeBrubeckNodeRegistry.getNode(nodeAddress)
            if (node !== undefined) {
                const assignment = this.assignments.get(streamId)
                if (assignment !== undefined) {
                    assignment.push(normalizedNodeAddress)
                } else {
                    this.assignments.set(streamId, [normalizedNodeAddress])
                }
                (node as FakeStorageNode).addAssignment(streamId)
            } else {
                throw new Error(`No storage node ${nodeAddress} for ${streamId}`)
            }
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async getStorageNodeUrl(_nodeAddress: string) {
        // return some dummy value: the receiving component passes the info to FakeRest,
        // and it is ignored there
        return ''
    }

    // eslint-disable-next-line class-methods-use-this
    async stop() {
    }

    // TODO implement other public methods of StorageNodeRegistry
}
