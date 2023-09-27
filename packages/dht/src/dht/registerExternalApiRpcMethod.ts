import { DhtNode } from '../exports'
import { FindDataRequest, FindDataResponse, FindMode } from '../proto/packages/dht/protos/DhtRpc'

export const registerExternalApiRpcMethod = (thisNode: DhtNode): void => {
    const rpcCommunicator = thisNode.getRpcCommunicator()
    rpcCommunicator.registerRpcMethod(
        FindDataRequest, 
        FindDataResponse, 
        'findData', 
        (req: FindDataRequest) => findData(thisNode, req),
        { timeout: 15000 }
    )
}

// IDHTRpcService method for external findRecursive calls
const findData = async (thisNode: DhtNode, findDataRequest: FindDataRequest): Promise<FindDataResponse> => {
    const result = await thisNode.startRecursiveFind(findDataRequest.kademliaId, FindMode.DATA, findDataRequest.requestor)
    if (result.dataEntries) {
        return FindDataResponse.create({ dataEntries: result.dataEntries })
    } else {
        return FindDataResponse.create({ 
            dataEntries: [],
            error: 'Could not find data with the given key' 
        })
    }
}
