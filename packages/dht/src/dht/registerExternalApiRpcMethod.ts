import { DhtNode } from '../exports'
import { FindDataRequest, FindDataResponse, FindMode } from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export const registerExternalApiRpcMethod = (thisNode: DhtNode): void => {
    const rpcCommunicator = thisNode.getRpcCommunicator()
    rpcCommunicator.registerRpcMethod(
        FindDataRequest, 
        FindDataResponse, 
        'findData', 
        (req: FindDataRequest, context) => findData(thisNode, req, context),
        { timeout: 15000 }
    )
}

// IDHTRpcService method for external findRecursive calls
const findData = async (thisNode: DhtNode, findDataRequest: FindDataRequest, _context: ServerCallContext): Promise<FindDataResponse> => {
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
