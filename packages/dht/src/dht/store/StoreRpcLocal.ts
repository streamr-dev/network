import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger, executeSafePromise } from '@streamr/utils'
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
import { areEqualPeerDescriptors, DhtAddress, getDhtAddressFromRaw } from '../../identifiers'

interface StoreRpcLocalConfig {
    localDataStore: LocalDataStore
    localPeerDescriptor: PeerDescriptor
    replicateDataToContact: (dataEntry: DataEntry, contact: PeerDescriptor) => Promise<void>
    getStorers: (key: DhtAddress) => ReadonlyArray<PeerDescriptor>
}

const logger = new Logger(module)

export class StoreRpcLocal implements IStoreRpc {

    private readonly config: StoreRpcLocalConfig

    constructor(config: StoreRpcLocalConfig) {
        this.config = config
    }

    private isLocalNodeStorer(dataKey: DhtAddress): boolean {
        return this.config.getStorers(dataKey).some((p) => areEqualPeerDescriptors(p, this.config.localPeerDescriptor))    
    }

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        logger.trace('storeData()')
        const key = getDhtAddressFromRaw(request.key)
        const isLocalNodeStorer = this.isLocalNodeStorer(key)
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
            this.replicateDataToNeighbors((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        const key = getDhtAddressFromRaw(dataEntry.key)
        if (!this.isLocalNodeStorer(key)) {
            this.config.localDataStore.setAllEntriesAsStale(key)
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }

    private replicateDataToNeighbors(requestor: PeerDescriptor, dataEntry: DataEntry): void {
        const dataKey = getDhtAddressFromRaw(dataEntry.key)
        const storers = this.config.getStorers(dataKey)
        const selfIsPrimaryStorer = areEqualPeerDescriptors(storers[0], this.config.localPeerDescriptor)
        // If we are the closest to the data, get storageRedundancyFactor - 1 nearest node to the data, and
        // replicate to all those node. Otherwise replicate only to the one closest one. And never replicate 
        // to the requestor nor to itself.
        const targets = (selfIsPrimaryStorer ? storers : [storers[0]]).filter(
            (p) => !areEqualPeerDescriptors(p, requestor) && !areEqualPeerDescriptors(p, this.config.localPeerDescriptor)
        )
        targets.forEach((target) => {
            setImmediate(() => {
                executeSafePromise(() => this.config.replicateDataToContact(dataEntry, target))
            })
        })
    }
}
