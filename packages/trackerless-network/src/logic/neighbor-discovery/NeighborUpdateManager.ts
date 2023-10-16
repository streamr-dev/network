import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ListeningRpcCommunicator, PeerDescriptor } from '@streamr/dht'
import { ProtoRpcClient, toProtoRpcClient } from '@streamr/proto-rpc'
import { NeighborUpdateRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { INeighborFinder } from './NeighborFinder'
import { NodeList } from '../NodeList'
import { RemoteNeighborUpdateManager } from './RemoteNeighborUpdateManager'
import { NeighborUpdateManagerServer } from './NeighborUpdateManagerServer'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

interface NeighborUpdateManagerConfig {
    ownPeerDescriptor: PeerDescriptor
    targetNeighbors: NodeList
    nearbyNodeView: NodeList
    neighborFinder: INeighborFinder
    randomGraphId: string
    rpcCommunicator: ListeningRpcCommunicator
    neighborUpdateInterval: number
}

const logger = new Logger(module)

export interface INeighborUpdateManager {
    start(): Promise<void>
    stop(): void
}

export class NeighborUpdateManager implements INeighborUpdateManager {
    private readonly abortController: AbortController
    private readonly config: NeighborUpdateManagerConfig
    private readonly client: ProtoRpcClient<NeighborUpdateRpcClient>
    private readonly server: NeighborUpdateManagerServer
    constructor(config: NeighborUpdateManagerConfig) {
        this.abortController = new AbortController()
        this.client = toProtoRpcClient(new NeighborUpdateRpcClient(config.rpcCommunicator.getRpcClientTransport()))
        this.server = new NeighborUpdateManagerServer(config)
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate',
            (req: NeighborUpdate, context) => this.server.neighborUpdate(req, context))
    }

    public async start(): Promise<void> {
        await scheduleAtInterval(() => this.updateNeighborInfo(), this.config.neighborUpdateInterval, false, this.abortController.signal)
    }

    public stop(): void {
        this.abortController.abort()
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to nodes`)
        const neighborDescriptors = this.config.targetNeighbors.getAll().map((neighbor) => neighbor.getPeerDescriptor())
        await Promise.allSettled(this.config.targetNeighbors.getAll().map(async (neighbor) => {
            const res = await this.createRemote(neighbor.getPeerDescriptor()).updateNeighbors(neighborDescriptors)
            if (res.removeMe) {
                this.config.targetNeighbors.remove(neighbor.getPeerDescriptor())
                this.config.neighborFinder.start([getNodeIdFromPeerDescriptor(neighbor.getPeerDescriptor())])
            }
        }))
    }

    private createRemote(targetPeerDescriptor: PeerDescriptor): RemoteNeighborUpdateManager {
        return new RemoteNeighborUpdateManager(this.config.ownPeerDescriptor, targetPeerDescriptor, this.config.randomGraphId, this.client)
    }
}
