import { ListeningRpcCommunicator } from '@streamr/dht'
import { NeighborUpdate } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INeighborUpdateRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NodeList } from '../NodeList'
import { INeighborFinder } from './NeighborFinder'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { getNodeIdFromPeerDescriptor, NodeID } from '../../identifiers'
import { binaryToHex, hexToBinary } from '@streamr/utils'

interface NeighborUpdateManagerConfig {
    ownNodeId: NodeID
    randomGraphId: string
    targetNeighbors: NodeList
    nearbyContactPool: NodeList
    neighborFinder: INeighborFinder
    rpcCommunicator: ListeningRpcCommunicator
}

export class NeighborUpdateManagerServer implements INeighborUpdateRpc {

    private readonly config: NeighborUpdateManagerConfig

    constructor(config: NeighborUpdateManagerConfig) {
        this.config = config
    }

    // INetworkRpc server method
    async neighborUpdate(message: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        if (this.config.targetNeighbors.hasNodeById(binaryToHex(message.senderId) as NodeID)) {
            const newPeerDescriptors = message.neighborDescriptors
                .filter((peerDescriptor) => {
                    const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
                    return nodeId !== this.config.ownNodeId && !this.config.targetNeighbors.getIds().includes(nodeId)
                })
            newPeerDescriptors.forEach((peerDescriptor) => this.config.nearbyContactPool.add(
                new RemoteRandomGraphNode(
                    peerDescriptor,
                    this.config.randomGraphId,
                    toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
                ))
            )
            this.config.neighborFinder.start()
            const response: NeighborUpdate = {
                senderId: hexToBinary(this.config.ownNodeId),
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getNodes().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: false
            }
            return response
        } else {
            const response: NeighborUpdate = {
                senderId: hexToBinary(this.config.ownNodeId),
                randomGraphId: this.config.randomGraphId,
                neighborDescriptors: this.config.targetNeighbors.getNodes().map((neighbor) => neighbor.getPeerDescriptor()),
                removeMe: true
            }
            return response
        }
    }
}
