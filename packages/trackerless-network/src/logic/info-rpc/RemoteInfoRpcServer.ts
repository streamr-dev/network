import { StreamPartID } from '@streamr/protocol'
import { InfoRequest, InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IInfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { Remote } from '../Remote'
import { DhtRpcOptions, PeerDescriptor } from '@streamr/dht'

export class RemoteInfoRpcServer extends Remote<IInfoRpcClient> {

    // streams is a list of stream partition IDs if empty list then return info about all streams
    async getInfo(
        ownPeerDescriptor: PeerDescriptor,
        getConnectionManagerInfo: boolean,
        getLayer0DhtNodeInfo: boolean,
        streamParts?: StreamPartID[]
    ): Promise<InfoResponse> {
        const request: InfoRequest = {
            getConnectionManagerInfo,
            getDhtNodeInfo: getLayer0DhtNodeInfo,
            getStreamrNodeInfo: streamParts ? {
                streamPartIds: streamParts 
            } : undefined
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor
        }
        // TODO: Why does TS think this is Promise<void>
        const result = await this.client.getInfo(request, options)
        return result as unknown as InfoResponse
    }

}
