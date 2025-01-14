import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { DhtAddress, areEqualPeerDescriptors, toDhtAddress, toNodeId, toDhtAddressRaw } from '../../identifiers'
import { Any } from '../../../generated/google/protobuf/any'
import { Timestamp } from '../../../generated/google/protobuf/timestamp'
import {
    DataEntry,
    PeerDescriptor,
    RecursiveOperation,
    ReplicateDataRequest,
    StoreDataRequest,
    StoreDataResponse
} from '../../../generated/packages/dht/protos/DhtRpc'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { ServiceID } from '../../types/ServiceID'
import { getClosestNodes } from '../contact/getClosestNodes'
import { RecursiveOperationManager } from '../recursive-operation/RecursiveOperationManager'
import { LocalDataStore } from './LocalDataStore'
import { StoreRpcLocal } from './StoreRpcLocal'
import { StoreRpcRemote } from './StoreRpcRemote'

interface StoreManagerOptions {
    rpcCommunicator: RoutingRpcCommunicator
    recursiveOperationManager: RecursiveOperationManager
    localPeerDescriptor: PeerDescriptor
    localDataStore: LocalDataStore
    serviceId: ServiceID
    highestTtl: number
    redundancyFactor: number
    getNeighbors: () => readonly PeerDescriptor[]
    createRpcRemote: (contact: PeerDescriptor) => StoreRpcRemote
}

const logger = new Logger(module)

export class StoreManager {
    private readonly options: StoreManagerOptions

    constructor(options: StoreManagerOptions) {
        this.options = options
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new StoreRpcLocal({
            localPeerDescriptor: this.options.localPeerDescriptor,
            localDataStore: this.options.localDataStore,
            replicateDataToContact: (dataEntry: DataEntry, contact: PeerDescriptor) =>
                this.replicateDataToContact(dataEntry, contact),
            getStorers: (dataKey: DhtAddress) => this.getStorers(dataKey)
        })
        this.options.rpcCommunicator.registerRpcMethod(
            StoreDataRequest,
            StoreDataResponse,
            'storeData',
            (request: StoreDataRequest) => rpcLocal.storeData(request)
        )
        this.options.rpcCommunicator.registerRpcNotification(
            ReplicateDataRequest,
            'replicateData',
            (request: ReplicateDataRequest, context: ServerCallContext) => rpcLocal.replicateData(request, context)
        )
    }

    onContactAdded(peerDescriptor: PeerDescriptor): void {
        for (const key of this.options.localDataStore.keys()) {
            this.replicateAndUpdateStaleState(key, peerDescriptor)
        }
    }

    private replicateAndUpdateStaleState(dataKey: DhtAddress, newNode: PeerDescriptor): void {
        const storers = this.getStorers(dataKey)
        const storersBeforeContactAdded = storers.filter((p) => !areEqualPeerDescriptors(p, newNode))
        const selfWasPrimaryStorer = areEqualPeerDescriptors(
            storersBeforeContactAdded[0],
            this.options.localPeerDescriptor
        )
        if (selfWasPrimaryStorer) {
            if (storers.some((p) => areEqualPeerDescriptors(p, newNode))) {
                setImmediate(async () => {
                    const dataEntries = Array.from(this.options.localDataStore.values(dataKey))
                    await Promise.all(
                        dataEntries.map(async (dataEntry) => this.replicateDataToContact(dataEntry, newNode))
                    )
                })
            }
        } else if (!storers.some((p) => areEqualPeerDescriptors(p, this.options.localPeerDescriptor))) {
            this.options.localDataStore.setAllEntriesAsStale(dataKey)
        }
    }

    private async replicateDataToContact(dataEntry: DataEntry, contact: PeerDescriptor): Promise<void> {
        const rpcRemote = this.options.createRpcRemote(contact)
        try {
            await rpcRemote.replicateData({ entry: dataEntry }, true)
        } catch (e) {
            logger.trace('replicateData() threw an exception ' + e)
        }
    }

    public async storeDataToDht(key: DhtAddress, data: Any, creator: DhtAddress): Promise<PeerDescriptor[]> {
        logger.debug(`Storing data to DHT ${this.options.serviceId}`)
        const result = await this.options.recursiveOperationManager.execute(key, RecursiveOperation.FIND_CLOSEST_NODES)
        const closestNodes = result.closestNodes
        const successfulNodes: PeerDescriptor[] = []
        const ttl = this.options.highestTtl // ToDo: make TTL decrease according to some nice curve
        const createdAt = Timestamp.now()
        for (let i = 0; i < closestNodes.length && successfulNodes.length < this.options.redundancyFactor; i++) {
            const keyRaw = toDhtAddressRaw(key)
            const creatorRaw = toDhtAddressRaw(creator)
            if (areEqualPeerDescriptors(this.options.localPeerDescriptor, closestNodes[i])) {
                this.options.localDataStore.storeEntry({
                    key: keyRaw,
                    data,
                    creator: creatorRaw,
                    createdAt,
                    storedAt: Timestamp.now(),
                    ttl,
                    stale: false,
                    deleted: false
                })
                successfulNodes.push(closestNodes[i])
                continue
            }
            const rpcRemote = this.options.createRpcRemote(closestNodes[i])
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
        const dataEntries = Array.from(this.options.localDataStore.values())
        await Promise.all(
            dataEntries.map(async (dataEntry) => {
                const dataKey = toDhtAddress(dataEntry.key)
                const neighbors = getClosestNodes(dataKey, this.options.getNeighbors(), {
                    maxCount: this.options.redundancyFactor
                })
                await Promise.all(
                    neighbors.map(async (neighbor) => {
                        const rpcRemote = this.options.createRpcRemote(neighbor)
                        try {
                            await rpcRemote.replicateData({ entry: dataEntry }, false)
                        } catch (err) {
                            logger.trace('Failed to replicate data in replicateDataToClosestNodes', { err })
                        }
                    })
                )
            })
        )
    }

    private getStorers(dataKey: DhtAddress, excludedNode?: PeerDescriptor): PeerDescriptor[] {
        return getClosestNodes(dataKey, [...this.options.getNeighbors(), this.options.localPeerDescriptor], {
            maxCount: this.options.redundancyFactor,
            excludedNodeIds: excludedNode !== undefined ? new Set([toNodeId(excludedNode)]) : undefined
        })
    }

    async destroy(): Promise<void> {
        await this.replicateDataToClosestNodes()
    }
}
