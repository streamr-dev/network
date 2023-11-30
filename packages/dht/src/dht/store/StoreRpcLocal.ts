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

const logger = new Logger(module)

interface StoreRpcLocalConfig {
    localDataStore: LocalDataStore
    replicateDataToNeighbors: (incomingPeer: PeerDescriptor, dataEntry: DataEntry) => void
    selfIsOneOfClosestPeers: (key: Uint8Array) => boolean
    maxTtl: number
}

export class StoreRpcLocal implements IStoreRpc {

    private readonly config: StoreRpcLocalConfig

    constructor(config: StoreRpcLocalConfig) {
        this.config = config
    }

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        const ttl = Math.min(request.ttl, this.config.maxTtl)
        const { key, data, createdAt, creator } = request
        const selfIsOneOfClosestPeers = this.config.selfIsOneOfClosestPeers(key)
        this.config.localDataStore.storeEntry({ 
            key, 
            data,
            creator, 
            createdAt,
            storedAt: Timestamp.now(),
            ttl,
            stale: !selfIsOneOfClosestPeers,
            deleted: false
        })
        if (!selfIsOneOfClosestPeers) {
            this.config.localDataStore.setAllEntriesAsStale(key)
        }
        logger.trace('storeData()')
        return StoreDataResponse.create()
    }

    public async replicateData(request: ReplicateDataRequest, context: ServerCallContext): Promise<Empty> {
        logger.trace('server-side replicateData()')
        const dataEntry = request.entry!
        const wasStored = this.config.localDataStore.storeEntry(dataEntry)
        if (wasStored) {
            this.config.replicateDataToNeighbors((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        if (!this.config.selfIsOneOfClosestPeers(dataEntry.key)) {
            this.config.localDataStore.setAllEntriesAsStale(dataEntry.key)
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }
}
