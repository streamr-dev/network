import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ConnectionLocker, DhtAddress, ListeningRpcCommunicator, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { NeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { NeighborFinder } from './NeighborFinder'
import { NodeList } from '../NodeList'
import { NeighborUpdateRpcRemote } from './NeighborUpdateRpcRemote'
import { NeighborUpdateRpcLocal } from './NeighborUpdateRpcLocal'
import { StreamPartID } from '@streamr/protocol'

interface NeighborUpdateManagerConfig {
    localPeerDescriptor: PeerDescriptor
    neighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: NeighborFinder
    connectionLocker: ConnectionLocker
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
    neighborUpdateInterval: number
    neighborTargetCount: number
    ongoingHandshakes: Set<DhtAddress>
}

const logger = new Logger(module)

export class NeighborUpdateManager {

    private readonly abortController: AbortController
    private readonly config: NeighborUpdateManagerConfig
    private readonly rpcLocal: NeighborUpdateRpcLocal

    constructor(config: NeighborUpdateManagerConfig) {
        this.abortController = new AbortController()
        this.rpcLocal = new NeighborUpdateRpcLocal(config)
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate',
            (req: NeighborUpdate, context) => this.rpcLocal.neighborUpdate(req, context))
    }

    async start(): Promise<void> {
        await scheduleAtInterval(() => this.updateNeighborInfo(), this.config.neighborUpdateInterval, false, this.abortController.signal)
    }

    stop(): void {
        this.abortController.abort()
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to nodes`)
        const neighborDescriptors = this.config.neighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor())
        await Promise.allSettled(this.config.neighbors.getAll().map(async (neighbor) => {
            const res = await this.createRemote(neighbor.getPeerDescriptor()).updateNeighbors(this.config.streamPartId, neighborDescriptors)
            if (res.removeMe) {
                const nodeId = getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())
                this.config.neighbors.remove(nodeId)
                this.config.connectionLocker.weakUnlockConnection(getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor()), this.config.streamPartId)
                this.config.neighborFinder.start([nodeId])
            }
        }))
    }

    private createRemote(targetPeerDescriptor: PeerDescriptor): NeighborUpdateRpcRemote {
        return new NeighborUpdateRpcRemote(
            this.config.localPeerDescriptor,
            targetPeerDescriptor,
            this.config.rpcCommunicator,
            NeighborUpdateRpcClient
        )
    }
}
