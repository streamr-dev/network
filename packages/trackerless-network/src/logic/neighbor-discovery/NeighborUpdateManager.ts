import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { DhtAddress, ListeningRpcCommunicator, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { NeighborFinder } from './NeighborFinder'
import { NodeList } from '../NodeList'
import { NeighborUpdateRpcRemote } from './NeighborUpdateRpcRemote'
import { NeighborUpdateRpcLocal } from './NeighborUpdateRpcLocal'
import { StreamPartID } from '@streamr/protocol'

interface NeighborUpdateManagerOptions {
    localPeerDescriptor: PeerDescriptor
    neighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: NeighborFinder
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
    neighborUpdateInterval: number
    neighborTargetCount: number
    ongoingHandshakes: Set<DhtAddress>
}

const logger = new Logger(module)

export class NeighborUpdateManager {

    private readonly abortController: AbortController
    private readonly options: NeighborUpdateManagerOptions
    private readonly rpcLocal: NeighborUpdateRpcLocal

    constructor(options: NeighborUpdateManagerOptions) {
        this.abortController = new AbortController()
        this.rpcLocal = new NeighborUpdateRpcLocal(options)
        this.options = options
        this.options.rpcCommunicator.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate',
            (req: NeighborUpdate, context) => this.rpcLocal.neighborUpdate(req, context))
    }

    async start(): Promise<void> {
        await scheduleAtInterval(() => this.updateNeighborInfo(), this.options.neighborUpdateInterval, false, this.abortController.signal)
    }

    stop(): void {
        this.abortController.abort()
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to nodes`)
        const neighborDescriptors = this.options.neighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor())
        await Promise.allSettled(this.options.neighbors.getAll().map(async (neighbor) => {
            const res = await this.createRemote(neighbor.getPeerDescriptor()).updateNeighbors(this.options.streamPartId, neighborDescriptors)
            if (res.removeMe) {
                const nodeId = getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())
                this.options.neighbors.remove(nodeId)
                this.options.neighborFinder.start([nodeId])
            }
        }))
    }

    private createRemote(targetPeerDescriptor: PeerDescriptor): NeighborUpdateRpcRemote {
        return new NeighborUpdateRpcRemote(
            this.options.localPeerDescriptor,
            targetPeerDescriptor,
            this.options.rpcCommunicator,
            NeighborUpdateRpcClient
        )
    }
}
