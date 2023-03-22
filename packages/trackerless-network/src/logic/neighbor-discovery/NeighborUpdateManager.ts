import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { keyFromPeerDescriptor, ListeningRpcCommunicator, PeerDescriptor } from '@streamr/dht'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { ProtoRpcClient, toProtoRpcClient } from '@streamr/proto-rpc'
import {
    NeighborUpdateRpcClient,
    NetworkRpcClient,
} from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Logger, scheduleAtInterval } from '@streamr/utils'
import { PeerIDKey } from '@streamr/dht/dist/src/helpers/PeerID'
import { NeighborFinder } from './NeighborFinder'
import { PeerList } from '../PeerList'
import { RemoteNeighborUpdateManager } from './RemoteNeighborUpdateManager'
import { INeighborUpdateRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'

interface NeighborUpdateManagerConfig {
    ownStringId: PeerIDKey
    ownPeerDescriptor: PeerDescriptor
    targetNeighbors: PeerList
    nearbyContactPool: PeerList
    neighborFinder: NeighborFinder
    randomGraphId: string
    rpcCommunicator: ListeningRpcCommunicator
}

const logger = new Logger(module)

export class NeighborUpdateManager implements INeighborUpdateRpc {
    private readonly abortController: AbortController
    private readonly config: NeighborUpdateManagerConfig
    private readonly client: ProtoRpcClient<NeighborUpdateRpcClient>
    constructor(config: NeighborUpdateManagerConfig) {
        this.abortController = new AbortController()
        this.client = toProtoRpcClient(new NeighborUpdateRpcClient(config.rpcCommunicator.getRpcClientTransport()))
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(NeighborUpdate, NeighborUpdate, 'neighborUpdate',
            (req: NeighborUpdate, context) => this.neighborUpdate(req, context))
    }

    public async start(): Promise<void> {
        await scheduleAtInterval(() => this.updateNeighborInfo(), 10000, false, this.abortController.signal)
    }

    public stop(): void {
        this.abortController.abort()
    }

    private async updateNeighborInfo(): Promise<void> {
        logger.trace(`Updating neighbor info to peers`)
        const neighborDescriptors = this.config.targetNeighbors!.values().map((neighbor) => neighbor.getPeerDescriptor())
        await Promise.allSettled(this.config.targetNeighbors!.values().map(async (neighbor) => {
            const res = await this.createRemote(neighbor.getPeerDescriptor()).updateNeighbors(this.config.ownPeerDescriptor, neighborDescriptors)
            if (res.removeMe) {
                this.config.targetNeighbors!.remove(neighbor.getPeerDescriptor())
                this.config.neighborFinder!.start([keyFromPeerDescriptor(neighbor.getPeerDescriptor())])
            }
        }))
    }

    private createRemote(targetPeerDescriptor: PeerDescriptor): RemoteNeighborUpdateManager {
        return new RemoteNeighborUpdateManager(targetPeerDescriptor, this.config.randomGraphId, this.client)
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.config.targetNeighbors!.hasPeerWithStringId(message.senderId)) {
            const newPeers = message.neighborDescriptors
                .filter((peerDescriptor) => {
                    const stringId = keyFromPeerDescriptor(peerDescriptor)
                    return stringId !== this.config.ownStringId && !this.config.targetNeighbors.getStringIds().includes(stringId)
                })
            newPeers.forEach((peer) => this.config.nearbyContactPool.add(
                new RemoteRandomGraphNode(
                    peer,
                    this.config.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator!.getRpcClientTransport()))
                ))
            )
            this.config.neighborFinder!.start()
            const response: NeighborUpdate = {
                senderId: this.config.ownStringId,
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.values().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: false
            }
            return response
        } else {
            const response: NeighborUpdate = {
                senderId: this.config.ownStringId,
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.values().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: true
            }
            return response
        }
    }
}
