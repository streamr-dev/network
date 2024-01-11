import { ControlLayerInfo, InfoRequest, InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IInfoRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NetworkStack } from '../../NetworkStack'
import { ListeningRpcCommunicator } from '@streamr/dht'

export const INFO_RPC_SERVICE_ID = 'system/info-rpc'
export class InfoRpcLocal implements IInfoRpc {
    
    private readonly stack: NetworkStack
    private readonly rpcCommunicator: ListeningRpcCommunicator
 
    constructor(stack: NetworkStack, rpcCommunicator: ListeningRpcCommunicator) {
        this.stack = stack
        this.rpcCommunicator = rpcCommunicator
    }

    registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcMethod(InfoRequest, InfoResponse, 'getInfo',
            () => this.getInfo())
    }
 
    public getControlLayerInfo(): ControlLayerInfo {
        return {
            connections: this.stack.getLayer0Node!().getAllConnectionPeerDescriptors(),
            neighbors: this.stack.getLayer0Node().getNeighbors()
        }
    }

    async getInfo(): Promise<InfoResponse> {
        return {
            peerDescriptor: this.stack.getLayer0Node().getLocalPeerDescriptor(),
            controlLayer: this.getControlLayerInfo(),
            streamPartitions: this.stack.getStreamrNode().getInfo()
        }
    }

}
