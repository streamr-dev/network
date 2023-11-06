import { DhtNode } from '../dht/DhtNode'
import { 
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    ExternalFindDataRequest,
    ExternalFindDataResponse
} from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'

export const registerExternalApiRpcMethods = (thisNode: DhtNode): void => {
    const rpcCommunicator = thisNode.getRpcCommunicator()
    rpcCommunicator.registerRpcMethod(
        ExternalFindDataRequest, 
        ExternalFindDataResponse, 
        'externalFindData', 
        (req: ExternalFindDataRequest, context: ServerCallContext) => externalFindData(thisNode, req, context),
        { timeout: 10000 }
    )
    rpcCommunicator.registerRpcMethod(
        ExternalStoreDataRequest,
        ExternalStoreDataResponse,
        'externalStoreData',
        (req: ExternalStoreDataRequest) => externalStoreData(thisNode, req),
        { timeout: 10000 }
    )
}

const externalFindData = async (
    thisNode: DhtNode,
    request: ExternalFindDataRequest,
    context: ServerCallContext
): Promise<ExternalFindDataResponse> => {
    const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
    const result = await thisNode.startFind(request.kademliaId, true, senderPeerDescriptor)
    if (result.dataEntries) {
        return ExternalFindDataResponse.create({ dataEntries: result.dataEntries })
    } else {
        return ExternalFindDataResponse.create({ 
            dataEntries: [],
            error: 'Could not find data with the given key' 
        })
    }
}

const externalStoreData = async (
    thisNode: DhtNode,
    request: ExternalStoreDataRequest
): Promise<ExternalStoreDataResponse> => {
    const result = await thisNode.storeDataToDht(request.key, request.data!)
    return ExternalStoreDataResponse.create({
        storers: result
    })
}
