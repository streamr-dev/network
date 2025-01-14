import { IExternalApiRpc } from '../../generated/packages/dht/protos/DhtRpc.server'
import {
    ExternalFetchDataRequest,
    ExternalFetchDataResponse,
    ExternalStoreDataRequest,
    ExternalStoreDataResponse,
    RecursiveOperation,
    PeerDescriptor
} from '../../generated/packages/dht/protos/DhtRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RecursiveOperationResult } from './recursive-operation/RecursiveOperationManager'
import { Any } from '../../generated/google/protobuf/any'
import { DhtAddress, toNodeId, toDhtAddress } from '../identifiers'

interface ExternalApiRpcLocalOptions {
    executeRecursiveOperation: (
        targetId: DhtAddress,
        operation: RecursiveOperation,
        excludedPeer: DhtAddress
    ) => Promise<RecursiveOperationResult>
    storeDataToDht: (key: DhtAddress, data: Any, creator: DhtAddress) => Promise<PeerDescriptor[]>
}

export class ExternalApiRpcLocal implements IExternalApiRpc {
    private readonly options: ExternalApiRpcLocalOptions

    constructor(options: ExternalApiRpcLocalOptions) {
        this.options = options
    }

    async externalFetchData(
        request: ExternalFetchDataRequest,
        context: ServerCallContext
    ): Promise<ExternalFetchDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.options.executeRecursiveOperation(
            toDhtAddress(request.key),
            RecursiveOperation.FETCH_DATA,
            toNodeId(senderPeerDescriptor)
        )
        return ExternalFetchDataResponse.create({ entries: result.dataEntries ?? [] })
    }

    async externalStoreData(
        request: ExternalStoreDataRequest,
        context: ServerCallContext
    ): Promise<ExternalStoreDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.options.storeDataToDht(
            toDhtAddress(request.key),
            request.data!,
            toNodeId(senderPeerDescriptor)
        )
        return ExternalStoreDataResponse.create({
            storers: result
        })
    }
}
