import { IExternalApiRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import {
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    FindDataRequest,
    FindDataResponse,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RecursiveFindResult } from './find/RecursiveFinder'
import { Any } from '../proto/google/protobuf/any'

interface ExternalApiRpcLocalConfig {
    startRecursiveFind: (idToFind: Uint8Array, fetchData: boolean, excludedPeer: PeerDescriptor) => Promise<RecursiveFindResult>
    storeDataToDht: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
}

export class ExternalApiRpcLocal implements IExternalApiRpc {

    private readonly config: ExternalApiRpcLocalConfig

    constructor(config: ExternalApiRpcLocalConfig) {
        this.config = config
    }

    async findData(findDataRequest: FindDataRequest, context: ServerCallContext): Promise<FindDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.startRecursiveFind(findDataRequest.kademliaId, true, senderPeerDescriptor)
        if (result.dataEntries) {
            return FindDataResponse.create({ dataEntries: result.dataEntries })
        } else {
            return FindDataResponse.create({ 
                dataEntries: [],
                error: 'Could not find data with the given key' 
            })
        }
    }

    async externalStoreData(request: ExternalStoreDataRequest): Promise<ExternalStoreDataResponse> {
        const result = await this.config.storeDataToDht(request.key, request.data!)
        return ExternalStoreDataResponse.create({
            storers: result
        })
    }
}
