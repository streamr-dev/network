import { NodeInfoRequest, NodeInfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { INodeInfoRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NetworkStack } from '../../NetworkStack'
import { ListeningRpcCommunicator } from '@streamr/dht'
import { version as localVersion } from '../../../package.json'

export const NODE_INFO_RPC_SERVICE_ID = 'system/node-info-rpc'

export class NodeInfoRpcLocal implements INodeInfoRpc {
    
    private readonly stack: NetworkStack
    private readonly rpcCommunicator: ListeningRpcCommunicator
 
    constructor(stack: NetworkStack, rpcCommunicator: ListeningRpcCommunicator) {
        this.stack = stack
        this.rpcCommunicator = rpcCommunicator
        this.registerDefaultServerMethods()
    }

    private registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcMethod(NodeInfoRequest, NodeInfoResponse, 'getInfo',
            () => this.getInfo())
    }
 
    async getInfo(): Promise<NodeInfoResponse> {
        return {
            peerDescriptor: this.stack.getLayer0Node().getLocalPeerDescriptor(),
            controlLayer: {
                connections: this.stack.getLayer0Node().getConnections(),
                neighbors: this.stack.getLayer0Node().getNeighbors()
            },
            streamPartitions: this.stack.getStreamrNode().getNodeInfo(),
            version: localVersion
        }
    }

}
