import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { InfoRequest, InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IInfoRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { NetworkStack } from '../../NetworkStack'
import { StreamPartIDUtils } from '@streamr/protocol'
import { ListeningRpcCommunicator } from '@streamr/dht'

export const INFO_RPC_SERVICE_ID = 'InfoRpc'
export class InfoRpcServer implements IInfoRpc {
    
    private readonly stack: NetworkStack
    private readonly rpcCommunicator: ListeningRpcCommunicator
 
    constructor(stack: NetworkStack) {
        this.stack = stack
        this.rpcCommunicator = new ListeningRpcCommunicator(INFO_RPC_SERVICE_ID, stack.getConnectionManager())
    }

    registerDefaultServerMethods(): void {
        this.rpcCommunicator.registerRpcMethod(InfoRequest, InfoResponse, 'getInfo',
            (msg: InfoRequest, context: ServerCallContext) => this.getInfo(msg, context))
    }

    async getInfo(request: InfoRequest, _context: ServerCallContext): Promise<InfoResponse> {
        return {
            peerDescriptor: this.stack.getLayer0DhtNode().getPeerDescriptor(),
            controlLayerInfo: request.getControlLayerInfo ? this.stack.getLayer0DhtNode().getInfo() : undefined,
            streamInfo: request.getStreamInfo ? this.stack.getStreamrNode().getInfo(
                request.getStreamInfo.streamPartIds.map((id) => StreamPartIDUtils.parse(id))
            ) : undefined
        }
    }

}
