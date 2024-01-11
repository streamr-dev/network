import { StreamPartID } from '@streamr/protocol'
import { InfoRequest, InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { RpcRemote } from '@streamr/dht'

export class InfoRpcRemote extends RpcRemote<InfoRpcClient> {

    // streams is a list of streamPartIDs, if the list is empty then info of all streams is returned
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
        const result = await this.getClient().getInfo(request, this.formDhtRpcOptions())
        return result as unknown as InfoResponse
    }

}
