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
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../identifiers'
import { getDhtAddressFromRaw } from '../identifiers'

interface ExternalApiRpcLocalConfig {
    executeRecursiveOperation: (
        targetId: DhtAddress,
        operation: RecursiveOperation,
        excludedPeer: DhtAddress
    ) => Promise<RecursiveOperationResult>
    storeDataToDht: (
        key: DhtAddress,
        data: Any,
        creator: DhtAddress
    ) => Promise<PeerDescriptor[]>
}

export class ExternalApiRpcLocal implements IExternalApiRpc {

    private readonly config: ExternalApiRpcLocalConfig

    constructor(config: ExternalApiRpcLocalConfig) {
        this.config = config
    }

    async externalFindData(findDataRequest: ExternalFindDataRequest, context: ServerCallContext): Promise<ExternalFindDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.executeRecursiveOperation(
            getDhtAddressFromRaw(findDataRequest.key),
            RecursiveOperation.FETCH_DATA,
            getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        )
        return ExternalFindDataResponse.create({ entries: result.dataEntries ?? [] })
    }

    async externalStoreData(request: ExternalStoreDataRequest, context: ServerCallContext): Promise<ExternalStoreDataResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const result = await this.config.storeDataToDht(
            getDhtAddressFromRaw(request.key),
            request.data!,
            getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        )
        return ExternalStoreDataResponse.create({
            storers: result
        })
    }
}
