import { StreamPartID } from '@streamr/protocol'
import { InfoRequest, InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcRemote } from '@streamr/dht'

export class RemoteInfoRpcServer extends RpcRemote<InfoRpcClient> {

    // streams is a list of stream partition IDs if empty list then return info about all streams
    async getInfo(
        getControlLayerInfo: boolean,
        streamParts?: StreamPartID[]
    ): Promise<InfoResponse> {
        const request: InfoRequest = {
            getControlLayerInfo,
            getStreamInfo: streamParts ? {
                streamPartIds: streamParts 
            } : undefined
        }
        // TODO: Why does TS think this is Promise<void>
        const result = await this.getClient().getInfo(request, this.formDhtRpcOptions({}))
        return result as unknown as InfoResponse
    }

}
