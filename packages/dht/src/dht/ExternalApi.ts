import { DhtNode } from "../exports"
import { FindDataRequest, FindDataResponse, FindMode } from "../proto/packages/dht/protos/DhtRpc"
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export class ExternalApi {

    private readonly dhtNode: DhtNode

    constructor(dhtNode: DhtNode) {
        this.dhtNode = dhtNode
        const rpcCommunicator = this.dhtNode.getRpcCommunicator!()
        rpcCommunicator.registerRpcMethod(FindDataRequest, FindDataResponse, 'findData', 
            (req: FindDataRequest, context) => this.findData(req, context), { timeout: 15000 })
    }

    // IDHTRpcService method for external findRecursive calls
    async findData(findDataRequest: FindDataRequest, _context: ServerCallContext): Promise<FindDataResponse> {
        const result = await this.dhtNode.startRecursiveFind(findDataRequest.kademliaId, FindMode.DATA)
        if (result.dataEntries) {
            return FindDataResponse.create({ dataEntries: result.dataEntries })
        } else {
            return FindDataResponse.create({ 
                dataEntries: [],
                error: 'Could not find data with the given key' 
            })
        }
    }

}
