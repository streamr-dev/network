import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger, executeSafePromise } from '@streamr/utils'
import { Empty } from '../../../generated/google/protobuf/empty'
import { Timestamp } from '../../../generated/google/protobuf/timestamp'
import {
    DataEntry,
    PeerDescriptor,
    ReplicateDataRequest,
    StoreDataRequest,
    StoreDataResponse
} from '../../../generated/packages/dht/protos/DhtRpc'
import { IStoreRpc } from '../../../generated/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { LocalDataStore } from './LocalDataStore'
import { areEqualPeerDescriptors, DhtAddress, toDhtAddress } from '../../identifiers'

interface StoreRpcLocalOptions {
    localDataStore: LocalDataStore
    localPeerDescriptor: PeerDescriptor
    replicateDataToContact: (dataEntry: DataEntry, contact: PeerDescriptor) => Promise<void>
    getStorers: (key: DhtAddress) => readonly PeerDescriptor[]
}

const logger = new Logger(module)

export class StoreRpcLocal implements IStoreRpc {
    private readonly options: StoreRpcLocalOptions

    constructor(options: StoreRpcLocalOptions) {
        this.options = options
    }

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        logger.trace('storeData()')
        const key = toDhtAddress(request.key)
        const isLocalNodeStorer = this.isLocalNodeStorer(key)
        this.options.localDataStore.storeEntry({
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
            this.options.localDataStore.setAllEntriesAsStale(key)
        }
        return {}
    }

    public async replicateData(request: ReplicateDataRequest, context: ServerCallContext): Promise<Empty> {
        logger.trace('server-side replicateData()')
        const dataEntry = request.entry!
        const wasStored = this.options.localDataStore.storeEntry(dataEntry)
        if (wasStored) {
            this.replicateDataToNeighbors((context as DhtCallContext).incomingSourceDescriptor!, request.entry!)
        }
        const key = toDhtAddress(dataEntry.key)
        if (!this.isLocalNodeStorer(key)) {
            this.options.localDataStore.setAllEntriesAsStale(key)
        }
        logger.trace('server-side replicateData() at end')
        return {}
    }

    private isLocalNodeStorer(dataKey: DhtAddress): boolean {
        return this.options
            .getStorers(dataKey)
            .some((p) => areEqualPeerDescriptors(p, this.options.localPeerDescriptor))
    }

    private replicateDataToNeighbors(requestor: PeerDescriptor, dataEntry: DataEntry): void {
        const dataKey = toDhtAddress(dataEntry.key)
        const storers = this.options.getStorers(dataKey)
        const isLocalNodePrimaryStorer = areEqualPeerDescriptors(storers[0], this.options.localPeerDescriptor)
        // If we are the closest to the data, get storageRedundancyFactor - 1 nearest node to the data, and
        // replicate to all those node. Otherwise replicate only to the one closest one. And never replicate
        // to the requestor nor to itself.
        const targets = (isLocalNodePrimaryStorer ? storers : [storers[0]]).filter(
            (p) =>
                !areEqualPeerDescriptors(p, requestor) && !areEqualPeerDescriptors(p, this.options.localPeerDescriptor)
        )
        targets.forEach((target) => {
            setImmediate(() => {
                executeSafePromise(() => this.options.replicateDataToContact(dataEntry, target))
            })
        })
    }
}
