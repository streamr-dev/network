import { IExternalApiRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import {
    ExternalFindDataRequest,
    ExternalFindDataResponse,
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    RecursiveOperation,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RecursiveOperationResult } from './recursive-operation/RecursiveOperationManager'
import { Any } from '../proto/google/protobuf/any'

interface ExternalApiRpcLocalConfig {
    executeRecursiveOperation: (
        idToFind: Uint8Array,
        operation: RecursiveOperation,
        excludedPeer: PeerDescriptor
    ) => Promise<RecursiveOperationResult>
    storeDataToDht: (
        key: Uint8Array,
        data: Any,
        creator: PeerDescriptor
    ) => Promise<PeerDescriptor[]>
}

export class ExternalApiRpcLocal implements IExternalApiRpc {

    private readonly config: ExternalApiRpcLocalConfig

    constructor(config: ExternalApiRpcLocalConfig) {
        this.config = config
    }

    async externalFindData(findDataRequest: ExternalFindDataRequest, context: ServerCallContext): Promise<ExternalFindDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.executeRecursiveOperation(findDataRequest.key, RecursiveOperation.FETCH_DATA, senderPeerDescriptor)
        return ExternalFindDataResponse.create({ entries: result.dataEntries ?? [] })
    }

    async externalStoreData(request: ExternalStoreDataRequest, context: ServerCallContext): Promise<ExternalStoreDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.storeDataToDht(request.key, request.data!, senderPeerDescriptor)
        return ExternalStoreDataResponse.create({
            storers: result
        })
    }
}
