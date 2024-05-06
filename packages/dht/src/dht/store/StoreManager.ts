import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import {
    DhtAddress,
    areEqualPeerDescriptors,
    getDhtAddressFromRaw,
    getNodeIdFromPeerDescriptor,
    getRawFromDhtAddress
} from '../../identifiers'
import { Any } from '../../proto/google/protobuf/any'
import { Timestamp } from '../../proto/google/protobuf/timestamp'
import {
    DataEntry,
    PeerDescriptor,
    RecursiveOperation,
    ReplicateDataRequest,
    StoreDataRequest, StoreDataResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { ServiceID } from '../../types/ServiceID'
import { getClosestNodes } from '../contact/getClosestNodes'
import { RecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { LocalDataStore } from './LocalDataStore'
import { StoreRpcLocal } from './StoreRpcLocal'
import { StoreRpcRemote } from './StoreRpcRemote'

interface StoreManagerConfig {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveOperationManager: RecursiveOperationManager
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    highestTtl: number
    redundancyFactor: number
    getNeighbors: () => ReadonlyArray<PeerDescriptor>
    createRpcRemote: (contact: PeerDescriptor) => StoreRpcRemote
}

const logger = new Logger(module)

export class StoreManager {

    private readonly config: StoreManagerConfig

    constructor(config: StoreManagerConfig) {
        this.config = config
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new StoreRpcLocal({
            localPeerDescriptor: this.config.localPeerDescriptor,
            localDataStore: this.config.localDataStore,
            replicateDataToContact: (dataEntry: DataEntry, contact: PeerDescriptor) => this.replicateDataToContact(dataEntry, contact),
            getStorers: (dataKey: DhtAddress) => this.getStorers(dataKey)
        })
        this.config.rpcCommunicator.registerRpcMethod(StoreDataRequest, StoreDataResponse, 'storeData',
            (request: StoreDataRequest) => rpcLocal.storeData(request))
        this.config.rpcCommunicator.registerRpcNotification(ReplicateDataRequest, 'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => rpcLocal.replicateData(request, context))
    }

    onContactAdded(peerDescriptor: PeerDescriptor): void {
        for (const key of this.config.localDataStore.keys()) {
            this.replicateAndUpdateStaleState(key, peerDescriptor)
        }
    }

    private replicateAndUpdateStaleState(dataKey: DhtAddress, newNode: PeerDescriptor): void {
        const storers = this.getStorers(dataKey)
        const storersBeforeContactAdded = storers.filter((p) => !areEqualPeerDescriptors(p, newNode))
        const selfWasPrimaryStorer = areEqualPeerDescriptors(storersBeforeContactAdded[0], this.config.localPeerDescriptor)
        if (selfWasPrimaryStorer) {
            if (storers.some((p) => areEqualPeerDescriptors(p, newNode))) {
                setImmediate(async () => {
                    const dataEntries = Array.from(this.config.localDataStore.values(dataKey))
                    await Promise.all(dataEntries.map(async (dataEntry) => this.replicateDataToContact(dataEntry, newNode)))
                })
            }
        } else if (!storers.some((p) => areEqualPeerDescriptors(p, this.config.localPeerDescriptor))) {
            this.config.localDataStore.setAllEntriesAsStale(dataKey)
        }
    }

    private async replicateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor): Promise<void> {
        const rpcRemote = this.config.createRpcRemote(contact)
        try {
            await rpcRemote.replicateData({ entry: dataEntry })
        } catch (e) {
            logger.trace('replicateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: DhtAddress, data: Any, creator: DhtAddress): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.config.serviceId}`)
        const result = await this.config.recursiveOperationManager.execute(key, RecursiveOperation.FIND_CLOSEST_NODES)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.config.highestTtl // ToDo: make TTL decrease according to some nice curve
        const createdAt = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.config.redundancyFactor; i++) {
            const keyRaw = getRawFromDhtAddress(key)
            const creatorRaw = getRawFromDhtAddress(creator)
            if (areEqualPeerDescriptors(this.config.localPeerDescriptor, closestNodes[i])) {
                this.config.localDataStore.storeEntry({
                    key: keyRaw,
                    data,
                    creator: creatorRaw,
                    createdAt,
                    storedAt: Timestamp.now(), 
                    ttl, 
                    stale: false,
                    deleted: false,
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const rpcRemote = this.config.createRpcRemote(closestNodes[i])
            try {
                await rpcRemote.storeData({
                    key: keyRaw,
                    data,
                    creator: creatorRaw,
                    createdAt,
                    ttl
                })
                successfulNodes.push(closestNodes[i])
                logger.trace('remote.storeData() success')
            } catch (e) {
                logger.trace('remote.storeData() threw an exception ' + e)
            }
        }
        return successfulNodes
    }

    private async replicateDataToClosestNodes(): Promise<void> {
        const dataEntries = Array.from(this.config.localDataStore.values())
        await Promise.all(dataEntries.map(async (dataEntry) => {
            const dataKey = getDhtAddressFromRaw(dataEntry.key)
            const neighbors = getClosestNodes(
                dataKey,
                this.config.getNeighbors(),
                { maxCount: this.config.redundancyFactor }
            )
            await Promise.all(neighbors.map(async (neighbor) => {
                const rpcRemote = this.config.createRpcRemote(neighbor)
                try {
                    await rpcRemote.replicateData({ entry: dataEntry })
                } catch (err) {
                    logger.trace('Failed to replicate data in replicateDataToClosestNodes', { err })
                }
            }))
        }))
    }

    private getStorers(dataKey: DhtAddress, excludedNode?: PeerDescriptor): PeerDescriptor[] {
        return getClosestNodes(
            dataKey,
            [...this.config.getNeighbors(), this.config.localPeerDescriptor],
            { 
                maxCount: this.config.redundancyFactor,
                excludedNodeIds: excludedNode !== undefined ? new Set([getNodeIdFromPeerDescriptor(excludedNode)]) : undefined
            }
        )
    }

    async destroy(): Promise<void> {
        await this.replicateDataToClosestNodes()
    }
}
