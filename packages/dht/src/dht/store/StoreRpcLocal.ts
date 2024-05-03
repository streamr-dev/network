import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { Empty } from '../../proto/google/protobuf/empty'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import {
    DataEntry,
    PeerDescriptor,
    ReplicateDataRequest,
    StoreDataRequest, StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { IStoreRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { LocalDataStore } from './LocalDataStore'
import { DhtAddress, getDhtAddressFromRaw } from '../../identifiers'

interface StoreRpcLocalConfig {
    localDataStore: LocalDataStore
    replicateDataToNeighbors: (incomingPeer: PeerDescriptor, dataEntry: DataEntry) => void
    isLocalNodeStorer: (key: DhtAddress) => boolean
}

const logger = new Logger(module)

export class StoreRpcLocal implements IStoreRpc {

    private readonly config: StoreRpcLocalConfig

    constructor(config: StoreRpcLocalConfig) {
        this.config = config
    }

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        logger.trace('storeData()')
        const key = getDhtAddressFromRaw(request.key)
        const isLocalNodeStorer = this.config.isLocalNodeStorer(key)
        this.config.localDataStore.storeEntry({ 
            key: request.key,
            data: request.data,
            creator: request.creator,
            createdAt: request.createdAt,
            storedAt: Timestamp.now(),
            ttl: request.ttl,
            stale: !isLocalNodeStorer,
            deleted: false
        })
        if (!isLocalNodeStorer) {
            this.config.localDataStore.setAllEntriesAsStale(key)
        }
        return {}
    }

    public async replicateData(request: ReplicateDataRequest, context: ServerCallContext): Promise<Empty> {
        logger.trace('server-side replicateData()')
        const dataEntry = request.entry!
        const wasStored = this.config.localDataStore.storeEntry(dataEntry)
        if (wasStored) {
            this.config.replicateDataToNeighbors((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        const key = getDhtAddressFromRaw(dataEntry.key)
        if (!this.config.isLocalNodeStorer(key)) {
            this.config.localDataStore.setAllEntriesAsStale(key)
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }
}
