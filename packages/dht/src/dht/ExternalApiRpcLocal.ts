import { IExternalApiRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import {
    ExternalFindDataRequest,
    ExternalFindDataResponse,
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { FindResult } from './find/Finder'
import { Any } from '../proto/google/protobuf/any'

interface ExternalApiRpcLocalConfig {
    startFind: (idToFind: Uint8Array, fetchData: boolean, excludedPeer: PeerDescriptor) => Promise<FindResult>
    storeDataToDht: (key: Uint8Array, data: Any) => Promise<PeerDescriptor[]>
}

export class ExternalApiRpcLocal implements IExternalApiRpc {

    private readonly config: ExternalApiRpcLocalConfig

    constructor(config: ExternalApiRpcLocalConfig) {
        this.config = config
    }

    async externalFindData(findDataRequest: ExternalFindDataRequest, context: ServerCallContext): Promise<ExternalFindDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.startFind(findDataRequest.kademliaId, true, senderPeerDescriptor)
        return ExternalFindDataResponse.create({ entries: result.dataEntries ?? [] })
    }

    async externalStoreData(request: ExternalStoreDataRequest): Promise<ExternalStoreDataResponse> {
        const result = await this.config.storeDataToDht(request.key, request.data!)
        return ExternalStoreDataResponse.create({
            storers: result
        })
    }
}
