import { DhtNode } from '../dht/DhtNode'
import { ExternalStoreDataRequest, ExternalStoreDataResponse, FindDataRequest, FindDataResponse } from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'

export const registerExternalApiRpcMethods = (thisNode: DhtNode): void => {
    const rpcCommunicator = thisNode.getRpcCommunicator()
    rpcCommunicator.registerRpcMethod(
        FindDataRequest, 
        FindDataResponse, 
        'findData', 
        (req: FindDataRequest, context: ServerCallContext) => findData(thisNode, req, context),
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

// IDHTRpcService method for external findRecursive calls
const findData = async (thisNode: DhtNode, findDataRequest: FindDataRequest, context: ServerCallContext): Promise<FindDataResponse> => {
    const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
    const result = await thisNode.startRecursiveFind(findDataRequest.kademliaId, true, senderPeerDescriptor)
    if (result.dataEntries) {
        return FindDataResponse.create({ dataEntries: result.dataEntries })
    } else {
        return FindDataResponse.create({ 
            dataEntries: [],
            error: 'Could not find data with the given key' 
        })
    }
}

// IDHTRpcService method for external storeData calls
const externalStoreData = async (thisNode: DhtNode, request: ExternalStoreDataRequest): Promise<ExternalStoreDataResponse> => {
    const result = await thisNode.storeDataToDht(request.key, request.data!)
    return ExternalStoreDataResponse.create({
        storers: result
    })
}
