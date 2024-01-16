import { ControlLayerInfo, NodeInfoRequest, NodeInfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INodeInfoRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NetworkStack } from '../../NetworkStack'
import { ListeningRpcCommunicator } from '@streamr/dht'

export const NODE_INFO_RPC_SERVICE_ID = 'system/node-info-rpc'

export class NodeInfoRpcLocal implements INodeInfoRpc {
    
    private readonly stack: NetworkStack
    private readonly rpcCommunicator: ListeningRpcCommunicator
 
    constructor(stack: NetworkStack, rpcCommunicator: ListeningRpcCommunicator) {
        this.stack = stack
        this.rpcCommunicator = rpcCommunicator
    }

    registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcMethod(NodeInfoRequest, NodeInfoResponse, 'getInfo',
            () => this.getInfo())
    }
 
    public getControlLayerInfo(): ControlLayerInfo {
        return {
            connections: this.stack.getLayer0Node!().getConnections(),
            neighbors: this.stack.getLayer0Node().getNeighbors()
        }
    }

    async getInfo(): Promise<NodeInfoResponse> {
        return {
            peerDescriptor: this.stack.getLayer0Node().getLocalPeerDescriptor(),
            controlLayer: this.getControlLayerInfo(),
            streamPartitions: this.stack.getStreamrNode().getNodeInfo()
        }
    }

}
